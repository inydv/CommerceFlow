import { pool } from "../../config/database.js";
import { withTransaction } from "../../common/database/transaction.js";
import { AppError } from "../../common/errors/app-error.js";

// Read order + item snapshots.
// User ID WHERE condition prevents BOLA:
// Customer A cannot read Customer B's order by guessing UUID.
async function readOrder(db, orderId, userId) {
  const orderResult = await db.query(
    `SELECT
       id, user_id AS "userId",
       status, currency_code AS "currencyCode",
       total_minor::text AS "totalMinor",
       created_at AS "createdAt"
     FROM orders
     WHERE id = $1 AND user_id = $2`,
    [orderId, userId],
  );

  const order = orderResult.rows[0];

  if (!order) {
    throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const itemsResult = await db.query(
    `SELECT
       product_id AS "productId",
       product_name AS "productName",
       sku,
       quantity,
       unit_price_minor::text AS "unitPriceMinor",
       line_total_minor::text AS "lineTotalMinor"
     FROM order_items
     WHERE order_id = $1
     ORDER BY product_id`,
    [orderId],
  );

  return { ...order, items: itemsResult.rows };
}

// -----------------------------------------------------
// CHECKOUT
// -----------------------------------------------------

export async function checkout(userId, idempotencyKey) {
  return withTransaction(async (client) => {
    // 1. Check whether this exact checkout attempt already exists.
    // WHY: HTTP retry/network timeout must not duplicate orders.
    //
    // UNIQUE(user_id, idempotency_key) in PostgreSQL is
    // the final concurrency-safe protection.
    const existing = await client.query(
      `SELECT id FROM orders
       WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );

    if (existing.rowCount) {
      return {
        order: await readOrder(client, existing.rows[0].id, userId),
        replayed: true,
      };
    }

    // 2. Lock this user's cart.
    // Cart modifications use the SAME cart row lock.
    // WHY: Two checkouts of one cart cannot both read
    // and consume its items simultaneously.
    const cartResult = await client.query(
      `SELECT id FROM carts
       WHERE user_id = $1
       FOR UPDATE`,
      [userId],
    );

    if (!cartResult.rowCount) {
      throw new AppError("Cart is empty", 409, "EMPTY_CART");
    }

    const cartId = cartResult.rows[0].id;

    // 3. Re-check idempotency after acquiring cart lock.
    // WHY: Concurrent first checkout may have committed
    // while this request waited for the lock.
    const afterLock = await client.query(
      `SELECT id FROM orders
       WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );

    if (afterLock.rowCount) {
      return {
        order: await readOrder(client, afterLock.rows[0].id, userId),
        replayed: true,
      };
    }

    // 4. Read current products/prices, not prices supplied
    // by the browser.
    //
    // WHY: Client must never choose checkout prices.
    // SKU/name/price are snapshotted into order_items.
    const itemResult = await client.query(
      `SELECT
         ci.product_id,
         ci.quantity,
         p.name,
         p.sku,
         p.price_minor,
         p.status,
         c.is_active AS category_active
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE ci.cart_id = $1
       ORDER BY ci.product_id`,
      [cartId],
    );

    const items = itemResult.rows;

    if (items.length === 0) {
      throw new AppError("Cart is empty", 409, "EMPTY_CART");
    }

    // 5. Validate catalog availability.
    for (const item of items) {
      if (item.status !== "active" || !item.category_active) {
        throw new AppError(
          `Product ${item.sku} is no longer available`,
          409,
          "PRODUCT_UNAVAILABLE",
        );
      }
    }

    // 6. Lock inventory rows in stable product-ID order.
    //
    // WHY: Concurrent checkouts cannot read the same stock
    // as available and both reserve it.
    //
    // Locking in consistent order also reduces deadlock risk
    // when orders contain overlapping products.
    for (const item of items) {
      const inventoryResult = await client.query(
        `SELECT on_hand, reserved
         FROM inventory
         WHERE product_id = $1
         FOR UPDATE`,
        [item.product_id],
      );

      const stock = inventoryResult.rows[0];

      // No inventory row means zero available stock.
      if (!stock || stock.on_hand - stock.reserved < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${item.sku}`,
          409,
          "INSUFFICIENT_STOCK",
        );
      }
    }

    // 7. Calculate order total using integer arithmetic.
    // PostgreSQL BIGINT arrives as string by default.
    //
    // WHY: JavaScript floating-point arithmetic is not
    // appropriate for exact money totals.
    const totalMinor = items.reduce(
      (sum, item) => sum + BigInt(item.price_minor) * BigInt(item.quantity),
      0n,
    );

    // 8. Create pending-payment order.
    //
    // IMPORTANT: This is NOT a paid order.
    // Payment will be processed in CP-05.
    const orderResult = await client.query(
      `INSERT INTO orders (
         user_id, idempotency_key,
         status, currency_code, total_minor
       )
       VALUES ($1, $2, 'pending_payment', 'INR', $3)
       RETURNING id`,
      [userId, idempotencyKey, totalMinor.toString()],
    );

    const orderId = orderResult.rows[0].id;

    // 9. Reserve each item's stock and snapshot its price.
    for (const item of items) {
      // Conditional UPDATE is a second integrity guard.
      // Even if read logic changes later, negative available
      // stock cannot pass this condition.
      const updated = await client.query(
        `UPDATE inventory
         SET reserved = reserved + $1,
             updated_at = NOW()
         WHERE product_id = $2
           AND on_hand - reserved >= $1
         RETURNING product_id`,
        [item.quantity, item.product_id],
      );

      if (!updated.rowCount) {
        throw new AppError(
          "Stock changed during checkout",
          409,
          "INSUFFICIENT_STOCK",
        );
      }

      const lineTotal = BigInt(item.price_minor) * BigInt(item.quantity);

      // Snapshot means historical orders keep their actual
      // checkout price even if catalog price changes later.
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id,
           product_name, sku,
           quantity, unit_price_minor, line_total_minor
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          orderId,
          item.product_id,
          item.name,
          item.sku,
          item.quantity,
          item.price_minor,
          lineTotal.toString(),
        ],
      );

      // Audit WHY reservation increased.
      await client.query(
        `INSERT INTO inventory_movements (
           product_id, order_id,
           delta_reserved, reason
         )
         VALUES ($1, $2, $3, 'order_reserved')`,
        [item.product_id, orderId, item.quantity],
      );
    }

    // 10. Clear cart within the SAME transaction.
    // WITHOUT THIS: Checkout may commit but customer still
    // sees products in cart and can checkout them again.
    await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);

    await client.query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [
      cartId,
    ]);

    // COMMIT is handled by shared withTransaction().
    // Any error before COMMIT rolls back order AND stock.
    return {
      order: await readOrder(client, orderId, userId),
      replayed: false,
    };
  });
}

// -----------------------------------------------------
// ORDER HISTORY
// -----------------------------------------------------

export async function listOrders(userId) {
  const result = await pool.query(
    `SELECT
       id,
       status,
       total_minor::text AS "totalMinor",
       currency_code AS "currencyCode",
       created_at AS "createdAt"
     FROM orders
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    [userId],
  );

  return result.rows;
}

export async function getOrder(userId, orderId) {
  return readOrder(pool, orderId, userId);
}

// -----------------------------------------------------
// ORDER CANCELLATION
// -----------------------------------------------------

export async function cancelOrder(userId, orderId) {
  return withTransaction(async (client) => {
    // Lock order before checking/changing its state.
    // WHY: Concurrent cancel/payment callbacks must not
    // both transition the same order independently.
    const result = await client.query(
      `SELECT id, status
       FROM orders
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [orderId, userId],
    );

    const order = result.rows[0];

    if (!order) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    // Repeated cancellation must not release stock twice.
    if (order.status === "cancelled") {
      return readOrder(client, orderId, userId);
    }

    // Paid order needs refund/cancellation policy in CP-05.
    if (order.status !== "pending_payment") {
      throw new AppError(
        "Paid order cannot be cancelled using this endpoint",
        409,
        "ORDER_CANNOT_CANCEL",
      );
    }

    const itemsResult = await client.query(
      `SELECT product_id, quantity
       FROM order_items
       WHERE order_id = $1
       ORDER BY product_id`,
      [orderId],
    );

    // Same stable product locking order as checkout.
    for (const item of itemsResult.rows) {
      const updated = await client.query(
        `UPDATE inventory
         SET reserved = reserved - $1,
             updated_at = NOW()
         WHERE product_id = $2
           AND reserved >= $1
         RETURNING product_id`,
        [item.quantity, item.product_id],
      );

      if (!updated.rowCount) {
        // This is an unexpected consistency problem.
        // Roll back rather than silently lose an audit trail.
        throw new Error("Inventory reservation inconsistency");
      }

      await client.query(
        `INSERT INTO inventory_movements (
           product_id, order_id,
           delta_reserved, reason
         )
         VALUES ($1, $2, $3, 'order_cancelled')`,
        [item.product_id, orderId, -item.quantity],
      );
    }

    await client.query(
      `UPDATE orders
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1`,
      [orderId],
    );

    // All reservation releases + order state change
    // commit atomically.
    return readOrder(client, orderId, userId);
  });
}
