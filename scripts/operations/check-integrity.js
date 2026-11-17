import { pool } from "../../src/config/database.js";
import { logger } from "../../src/common/logger/logger.js";

// READ-ONLY integrity inspection.
//
// WHY: Several modules modify Inventory, Orders and Payments.
// We need one place to check cross-module business invariants.
//
// This script does NOT repair or delete data.
// Automatic repairs could hide serious payment/accounting bugs.
//
// Run while the application is not actively writing,
// or treat results as a point-in-time diagnostic rather
// than a guaranteed transactionally consistent audit.

const checks = [
  {
    name: "negative_or_excessive_inventory",
    sql: `
      SELECT
        product_id,
        on_hand,
        reserved
      FROM inventory
      WHERE on_hand < 0
         OR reserved < 0
         OR reserved > on_hand
    `,
  },

  {
    name: "reserved_stock_mismatch",
    sql: `
      -- Current inventory reservation must equal the
      -- quantities of pending-payment orders.
      --
      -- WHY: Failed checkout/cancellation must never
      -- leave orphaned reserved quantities.

      SELECT
        i.product_id,
        i.reserved AS recorded_reserved,

        COALESCE(
          SUM(oi.quantity) FILTER (
            WHERE o.status = 'pending_payment'
          ),
          0
        ) AS expected_reserved

      FROM inventory i

      LEFT JOIN order_items oi
        ON oi.product_id = i.product_id

      LEFT JOIN orders o
        ON o.id = oi.order_id

      GROUP BY i.product_id, i.reserved

      HAVING i.reserved <>
        COALESCE(
          SUM(oi.quantity) FILTER (
            WHERE o.status = 'pending_payment'
          ),
          0
        )
    `,
  },

  {
    name: "paid_order_without_successful_payment",
    sql: `
      SELECT o.id, o.status
      FROM orders o
      LEFT JOIN payments p ON p.order_id = o.id

      WHERE o.status IN (
        'paid',
        'refund_pending',
        'refunded'
      )

      AND (
        p.id IS NULL OR
        p.status <> 'succeeded'
      )
    `,
  },

  {
    name: "refunded_order_without_successful_refund",
    sql: `
      SELECT o.id, o.status
      FROM orders o
      LEFT JOIN refunds r ON r.order_id = o.id

      WHERE o.status = 'refunded'

      AND (
        r.id IS NULL OR
        r.status <> 'succeeded'
      )
    `,
  },

  {
    name: "cancelled_order_with_pending_payment",
    sql: `
      SELECT o.id, p.status AS payment_status
      FROM orders o
      JOIN payments p ON p.order_id = o.id

      WHERE o.status = 'cancelled'
        AND p.status = 'pending'
    `,
  },
];

async function main() {
  const client = await pool.connect();

  let failures = 0;

  try {
    // One consistent snapshot for all SELECT statements.
    // WHY: Concurrent checkout/payment transactions should
    // not cause different checks to observe incompatible
    // moments in time.
    //
    // READ ONLY protects against accidental writes in checks.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    for (const check of checks) {
      const result = await client.query(check.sql);

      const count = result.rows.length;

      logger.info(
        { check: check.name, violations: count },
        "Integrity check completed",
      );

      // Show a bounded number of offending record details.
      if (count > 0) {
        failures += count;

        logger.error(
          {
            check: check.name,
            examples: result.rows.slice(0, 5),
          },
          "Integrity violation found",
        );
      }
    }

    // Overdue pending orders can be normal if the
    // background worker has not yet polled them.
    const overdue = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE status = 'pending_payment'
        AND payment_deadline_at < NOW()
    `);

    logger.info(
      { overduePendingOrders: overdue.rows[0].count },
      "Expiry backlog",
    );

    await client.query("COMMIT");

    if (failures > 0) {
      process.exitCode = 1;
    } else {
      logger.info("All checked integrity invariants passed");
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve original diagnostic error.
    }

    throw error;
  } finally {
    client.release();
  }
}

try {
  await main();
} catch (error) {
  logger.error({ err: error }, "Integrity inspection failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
