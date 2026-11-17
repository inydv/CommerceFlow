import { pool } from "../config/database.js";
import { withTransaction } from "../common/database/transaction.js";
import { releaseReservation } from "../modules/payments/payment.service.js";

// Find expired orders that still hold reservations.
//
// WHY: A customer may abandon payment after checkout.
// WITHOUT EXPIRY: Reserved stock can remain blocked forever.
export async function findExpiredOrders() {
  const result = await pool.query(
    `SELECT id
     FROM orders
     WHERE status = 'pending_payment'
       AND payment_deadline_at <= NOW()
     ORDER BY payment_deadline_at, id
     LIMIT 50`,
  );

  return result.rows.map((row) => row.id);
}

// BullMQ can retry this function safely.
// Order row locking and status checks prevent double release.
export async function expireOrder(orderId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, status, payment_deadline_at
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId],
    );

    const order = result.rows[0];

    if (!order || order.status !== "pending_payment") {
      return { changed: false };
    }

    // Re-check deadline inside transaction.
    // WHY: Job can run before due time or be retried.
    const due = await client.query(
      `SELECT $1::timestamptz <= NOW() AS expired`,
      [order.payment_deadline_at],
    );

    if (!due.rows[0].expired) {
      return { changed: false };
    }

    // Release all held stock, atomically with order cancellation.
    await releaseReservation(client, orderId);

    await client.query(
      `UPDATE orders
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [orderId],
    );

    // If an intent exists, mark it expired too.
    await client.query(
      `UPDATE payments
       SET status = 'expired', updated_at = NOW()
       WHERE order_id = $1 AND status = 'pending'`,
      [orderId],
    );

    // Record a durable notification intent.
    await client.query(
      `INSERT INTO outbox_events
       (event_key, event_type, payload)
       VALUES (
         $1,
         'order.expired',
         jsonb_build_object('orderId', $2::text)
       )
       ON CONFLICT (event_key) DO NOTHING`,
      [`order-expired-${orderId}`, orderId],
    );

    return { changed: true };
  });
}
