import { pool } from "../../config/database.js";
import { withTransaction } from "../../common/database/transaction.js";
import { AppError } from "../../common/errors/app-error.js";

// All stock/order mutations must happen in a single transaction.
// We lock ORDER FIRST, then inventory rows in product ID order.
// WHY: Webhooks, cancellation and expiry must serialize.

function conflict(message, code = "PAYMENT_CONFLICT") {
  return new AppError(message, 409, code);
}

// Inserts a durable event in the SAME transaction as state changes.
// WHY: If DB commits, notification intent cannot disappear just
// because Redis is temporarily unavailable.
async function addOutbox(client, key, type, payload) {
  await client.query(
    `INSERT INTO outbox_events
       (event_key, event_type, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (event_key) DO NOTHING`,
    [key, type, JSON.stringify(payload)],
  );
}

// Release stock reserved by an unpaid/cancelled order.
// Assumes the caller has already locked the order row.
export async function releaseReservation(client, orderId) {
  const items = await client.query(
    `SELECT product_id, quantity
     FROM order_items
     WHERE order_id = $1
     ORDER BY product_id`,
    [orderId],
  );

  for (const item of items.rows) {
    // Conditional UPDATE protects reserved >= 0 invariant.
    const changed = await client.query(
      `UPDATE inventory
       SET reserved = reserved - $1,
           updated_at = NOW()
       WHERE product_id = $2
         AND reserved >= $1
       RETURNING product_id`,
      [item.quantity, item.product_id],
    );

    if (!changed.rowCount) {
      // Roll back everything instead of silently corrupting stock.
      throw new Error("Reserved stock inconsistency");
    }

    await client.query(
      `INSERT INTO inventory_movements
       (product_id, order_id, delta_reserved, reason)
       VALUES ($1, $2, $3, 'order_cancelled')`,
      [item.product_id, orderId, -item.quantity],
    );
  }
}

// Payment success consumes stock reserved at checkout.
// Example before: on_hand=10, reserved=2, available=8.
// After payment: on_hand=8, reserved=0, available=8.
async function consumeReservation(client, orderId) {
  const items = await client.query(
    `SELECT product_id, quantity
     FROM order_items
     WHERE order_id = $1
     ORDER BY product_id`,
    [orderId],
  );

  for (const item of items.rows) {
    const changed = await client.query(
      `UPDATE inventory
       SET on_hand = on_hand - $1,
           reserved = reserved - $1,
           updated_at = NOW()
       WHERE product_id = $2
         AND reserved >= $1
         AND on_hand >= $1
       RETURNING product_id`,
      [item.quantity, item.product_id],
    );

    if (!changed.rowCount) {
      throw new Error("Payment stock consumption inconsistency");
    }

    await client.query(
      `INSERT INTO inventory_movements
       (
         product_id, order_id,
         delta_on_hand, delta_reserved, reason
       )
       VALUES ($1, $2, $3, $3, 'order_fulfilled')`,
      [item.product_id, orderId, -item.quantity],
    );
  }
}

// ------------------------------------------------------
// INITIATE PAYMENT
// ------------------------------------------------------

// Creates a LOCAL payment intent record.
// It does NOT contact a real bank/gateway or charge money.
export async function createPaymentIntent(userId, orderId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, status, total_minor, currency_code,
              payment_deadline_at,
              payment_deadline_at > NOW() AS within_deadline
       FROM orders
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [orderId, userId],
    );

    const order = result.rows[0];

    // Ownership is enforced in SQL: prevents BOLA.
    if (!order) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    if (order.status !== "pending_payment" || !order.within_deadline) {
      throw conflict("Order is not payable", "ORDER_NOT_PAYABLE");
    }

    // One payment intent per order; retry returns same intent.
    const payment = await client.query(
      `INSERT INTO payments
       (order_id, amount_minor, currency_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id) DO NOTHING`,
      [orderId, order.total_minor, order.currency_code],
    );

    const stored = await client.query(
      `SELECT id, order_id, status,
              amount_minor::text AS amount_minor,
              currency_code
       FROM payments
       WHERE order_id = $1`,
      [orderId],
    );

    return stored.rows[0];
  });
}

// ------------------------------------------------------
// VERIFIED WEBHOOK PROCESSING
// ------------------------------------------------------

// This receives an event ONLY after HMAC verification.
export async function processWebhook(event) {
  return withTransaction(async (client) => {
    const isRefund = event.type.startsWith("refund.");
    const referenceId = isRefund ? event.refundId : event.intentId;

    // Find order first, then acquire order lock.
    // All competing order-state transitions lock the same row.
    const lookup = await client.query(
      isRefund
        ? `SELECT order_id FROM refunds WHERE id = $1`
        : `SELECT order_id FROM payments WHERE id = $1`,
      [referenceId],
    );

    if (!lookup.rowCount) {
      throw new AppError(
        "Payment reference not found",
        404,
        "PAYMENT_REFERENCE_NOT_FOUND",
      );
    }

    const orderId = lookup.rows[0].order_id;

    const locked = await client.query(
      `SELECT id, status, payment_deadline_at,
              payment_deadline_at > NOW() AS within_deadline
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId],
    );

    const order = locked.rows[0];

    // Insert event ID within the transaction.
    // UNIQUE(event_id) prevents repeated delivery from
    // applying the same stock/payment transition twice.
    const eventRow = await client.query(
      `INSERT INTO payment_webhook_events
       (event_id, event_type, reference_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.eventId, event.type, referenceId],
    );

    if (!eventRow.rowCount) {
      return { duplicate: true, applied: false };
    }

    if (isRefund) {
      const refundResult = await client.query(
        `SELECT id, status
         FROM refunds
         WHERE id = $1 AND order_id = $2
         FOR UPDATE`,
        [referenceId, orderId],
      );

      const refund = refundResult.rows[0];

      if (refund.status !== "pending" || order.status !== "refund_pending") {
        return { duplicate: false, applied: false };
      }

      if (event.type === "refund.succeeded") {
        // Refund success is a provider-confirmed state.
        // This does NOT automatically restock returned goods.
        await client.query(
          `UPDATE refunds
           SET status = 'succeeded', updated_at = NOW()
           WHERE id = $1`,
          [refund.id],
        );

        await client.query(
          `UPDATE orders
           SET status = 'refunded', updated_at = NOW()
           WHERE id = $1`,
          [orderId],
        );

        await addOutbox(
          client,
          `refund-succeeded-${refund.id}`,
          "refund.succeeded",
          { orderId, refundId: refund.id },
        );
      } else {
        // Gateway reported refund failure.
        // Order remains paid; admin can investigate.
        await client.query(
          `UPDATE refunds
           SET status = 'failed', updated_at = NOW()
           WHERE id = $1`,
          [refund.id],
        );

        await client.query(
          `UPDATE orders
           SET status = 'paid', updated_at = NOW()
           WHERE id = $1`,
          [orderId],
        );

        await addOutbox(client, `refund-failed-${refund.id}`, "refund.failed", {
          orderId,
          refundId: refund.id,
        });
      }

      return { duplicate: false, applied: true };
    }

    const paymentResult = await client.query(
      `SELECT id, status
       FROM payments
       WHERE id = $1 AND order_id = $2
       FOR UPDATE`,
      [referenceId, orderId],
    );

    const payment = paymentResult.rows[0];

    // Late/contradictory events cannot overwrite a final state.
    // A real gateway integration must reconcile late successful
    // captures and issue refunds when necessary.
    if (payment.status !== "pending" || order.status !== "pending_payment") {
      return { duplicate: false, applied: false };
    }

    if (event.type === "payment.succeeded") {
      // A local simulator cannot prove that money moved.
      // This transition is accepted ONLY from signed dev events.
      //
      // Real provider integration must verify payment amount,
      // currency, merchant ownership and gateway reference.
      if (!order.within_deadline) {
        // Do not fulfill a locally expired reservation.
        // See late-payment reconciliation limitation below.
        return { duplicate: false, applied: false };
      }

      await consumeReservation(client, orderId);

      await client.query(
        `UPDATE payments
         SET status = 'succeeded', updated_at = NOW()
         WHERE id = $1`,
        [payment.id],
      );

      await client.query(
        `UPDATE orders
         SET status = 'paid', updated_at = NOW()
         WHERE id = $1`,
        [orderId],
      );

      await addOutbox(
        client,
        `payment-succeeded-${payment.id}`,
        "payment.succeeded",
        { orderId, paymentId: payment.id },
      );
    } else {
      // Failed payment cancels this pending order.
      // Reservation release is in the SAME transaction.
      await releaseReservation(client, orderId);

      await client.query(
        `UPDATE payments
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1`,
        [payment.id],
      );

      await client.query(
        `UPDATE orders
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1`,
        [orderId],
      );

      await addOutbox(
        client,
        `payment-failed-${payment.id}`,
        "payment.failed",
        { orderId, paymentId: payment.id },
      );
    }

    return { duplicate: false, applied: true };
  });
}

// ------------------------------------------------------
// ADMIN FULL REFUND
// ------------------------------------------------------

export async function requestRefund(orderId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, status, total_minor
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId],
    );

    const order = result.rows[0];

    if (!order) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    // Repeated request returns existing pending/succeeded refund.
    const existing = await client.query(
      `SELECT id, status, amount_minor::text AS "amountMinor"
       FROM refunds
       WHERE order_id = $1`,
      [orderId],
    );

    if (existing.rowCount) {
      return existing.rows[0];
    }

    if (order.status !== "paid") {
      throw conflict("Only paid orders can be refunded");
    }

    const payment = await client.query(
      `SELECT id FROM payments
       WHERE order_id = $1 AND status = 'succeeded'`,
      [orderId],
    );

    if (!payment.rowCount) {
      throw conflict("Successful payment not found");
    }

    const refund = await client.query(
      `INSERT INTO refunds
       (payment_id, order_id, amount_minor)
       VALUES ($1, $2, $3)
       RETURNING id, status, amount_minor::text AS "amountMinor"`,
      [payment.rows[0].id, orderId, order.total_minor],
    );

    await client.query(
      `UPDATE orders
       SET status = 'refund_pending', updated_at = NOW()
       WHERE id = $1`,
      [orderId],
    );

    // No refund-success event yet: gateway must confirm it.
    return refund.rows[0];
  });
}
