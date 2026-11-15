import { createHash, randomUUID } from "node:crypto";

import { pool } from "../../config/database.js";

// Create a consistent fingerprint from the operation's inputs.
const getRequestHash = (productId, quantity) => {
  const normalizedRequest = JSON.stringify({
    productId: productId.toLowerCase(),
    quantity,
  });

  return createHash("sha256").update(normalizedRequest).digest("hex");
};

// Create an order safely, even if the same HTTP request is retried.
export const createIdempotentOrder = async ({
  idempotencyKey,
  productId,
  quantity,
}) => {
  const requestHash = getRequestHash(productId, quantity);
  const client = await pool.connect();

  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const orderId = randomUUID();

    // STEP 1: Try to claim this request key.
    //
    // If another transaction owns the same key,
    // PostgreSQL's unique constraint coordinates the conflict.
    const claimResult = await client.query(
      `INSERT INTO idempotency_demo
         (idempotency_key, request_hash, order_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [idempotencyKey, requestHash, orderId],
    );

    // STEP 2: Someone already used this key.
    if (claimResult.rowCount === 0) {
      const existingResult = await client.query(
        `SELECT
           i.request_hash,
           o.*
         FROM idempotency_demo i
         JOIN orders_lifecycle_demo o
           ON o.id = i.order_id
         WHERE i.idempotency_key = $1`,
        [idempotencyKey],
      );

      const existing = existingResult.rows[0];

      // Same key cannot represent a different request.
      if (existing.request_hash !== requestHash) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return {
          outcome: "KEY_REUSED_WITH_DIFFERENT_REQUEST",
        };
      }

      // Same key, same request: reuse the original order.
      await client.query("COMMIT");
      transactionOpen = false;

      const { request_hash, ...order } = existing;

      return {
        outcome: "SUCCESS",
        replayed: true,
        order,
      };
    }

    // STEP 3: New key. Reserve stock atomically.
    const inventoryResult = await client.query(
      `UPDATE inventory_demo
       SET reserved = reserved + $1
       WHERE product_id = $2
         AND on_hand - reserved >= $1
       RETURNING product_id`,
      [quantity, productId],
    );

    if (inventoryResult.rowCount === 0) {
      // Also remove our uncommitted idempotency claim.
      await client.query("ROLLBACK");
      transactionOpen = false;

      return {
        outcome: "INSUFFICIENT_STOCK",
      };
    }

    // STEP 4: Create the new order.
    const orderResult = await client.query(
      `INSERT INTO orders_lifecycle_demo
         (id, product_id, quantity, status)
       VALUES ($1, $2, $3, 'PENDING_PAYMENT')
       RETURNING *`,
      [orderId, productId, quantity],
    );

    // STEP 5: Commit the idempotency key, stock reservation
    // and order together in the same PostgreSQL transaction.
    await client.query("COMMIT");
    transactionOpen = false;

    return {
      outcome: "SUCCESS",
      replayed: false,
      order: orderResult.rows[0],
    };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    throw error;
  } finally {
    client.release();
  }
};
