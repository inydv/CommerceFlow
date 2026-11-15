import { randomUUID } from "node:crypto";

import { pool } from "../../config/database.js";

// Allowed transitions for our learning experiment.
const ALLOWED_TRANSITIONS = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],

  CONFIRMED: ["SHIPPED", "CANCELLED"],

  SHIPPED: ["DELIVERED"],

  // These are final states in our demo.
  DELIVERED: [],
  CANCELLED: [],
};

// Check whether the requested state change is allowed.
const canTransition = (currentStatus, nextStatus) => {
  return ALLOWED_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;
};

// Create an order and reserve its inventory atomically.
export const createLifecycleOrder = async (productId, quantity) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Reserve only if enough inventory is available.
    const inventoryResult = await client.query(
      `UPDATE inventory_demo
       SET reserved = reserved + $1
       WHERE product_id = $2
         AND on_hand - reserved >= $1
       RETURNING product_id`,
      [quantity, productId],
    );

    if (inventoryResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return {
        outcome: "INSUFFICIENT_STOCK",
      };
    }

    const orderId = randomUUID();

    // Save the order in PENDING_PAYMENT status.
    const orderResult = await client.query(
      `INSERT INTO orders_lifecycle_demo
         (id, product_id, quantity, status)
       VALUES ($1, $2, $3, 'PENDING_PAYMENT')
       RETURNING *`,
      [orderId, productId, quantity],
    );

    // Both reservation and order creation succeed together.
    await client.query("COMMIT");

    return {
      outcome: "SUCCESS",
      order: orderResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Fetch the current state of a demo order.
export const getLifecycleOrder = async (orderId) => {
  const result = await pool.query(
    `SELECT *
     FROM orders_lifecycle_demo
     WHERE id = $1`,
    [orderId],
  );

  return result.rows[0] ?? null;
};

// Transition an order to its next allowed state.
export const transitionLifecycleOrder = async (orderId, nextStatus) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the order row so two updates cannot
    // independently finalize the same order.
    const orderResult = await client.query(
      `SELECT *
       FROM orders_lifecycle_demo
       WHERE id = $1
       FOR UPDATE`,
      [orderId],
    );

    const order = orderResult.rows[0];

    if (!order) {
      await client.query("ROLLBACK");
      return { outcome: "NOT_FOUND" };
    }

    // Reject invalid transitions.
    if (!canTransition(order.status, nextStatus)) {
      await client.query("ROLLBACK");

      return {
        outcome: "INVALID_TRANSITION",
        currentStatus: order.status,
        requestedStatus: nextStatus,
      };
    }

    // Payment success is simulated by the CONFIRMED transition.
    if (order.status === "PENDING_PAYMENT" && nextStatus === "CONFIRMED") {
      // Consume reserved stock.
      await client.query(
        `UPDATE inventory_demo
         SET on_hand = on_hand - $1,
             reserved = reserved - $1
         WHERE product_id = $2`,
        [order.quantity, order.product_id],
      );
    }

    if (nextStatus === "CANCELLED") {
      if (order.status === "PENDING_PAYMENT") {
        // Payment wasn't confirmed:
        // release the held inventory.
        await client.query(
          `UPDATE inventory_demo
           SET reserved = reserved - $1
           WHERE product_id = $2`,
          [order.quantity, order.product_id],
        );
      }

      if (order.status === "CONFIRMED") {
        // Our demo assumes the item hasn't shipped yet.
        // Restore physical inventory after cancellation.
        await client.query(
          `UPDATE inventory_demo
           SET on_hand = on_hand + $1
           WHERE product_id = $2`,
          [order.quantity, order.product_id],
        );
      }
    }

    // Update the order only after inventory changes succeeded.
    const updatedResult = await client.query(
      `UPDATE orders_lifecycle_demo
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [nextStatus, orderId],
    );

    await client.query("COMMIT");

    return {
      outcome: "SUCCESS",
      order: updatedResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
