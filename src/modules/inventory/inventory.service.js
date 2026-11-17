import { pool } from "../../config/database.js";
import { withTransaction } from "../../common/database/transaction.js";
import { AppError } from "../../common/errors/app-error.js";

// Public read: show available quantity, not internal reservations.
export async function getAvailability(productId) {
  const result = await pool.query(
    `SELECT
       p.id AS "productId",
       GREATEST(
         COALESCE(i.on_hand - i.reserved, 0),
         0
       ) AS available
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.id = $1
       AND p.status = 'active'
       AND c.is_active = TRUE`,
    [productId],
  );

  if (!result.rows[0]) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  return result.rows[0];
}

// Admin sets the physical stock count to an absolute quantity.
// This is NOT "add 10"; it means "stock is now exactly 10".
export async function setStock(productId, newOnHand) {
  return withTransaction(async (client) => {
    // Only existing, non-archived products can be stocked.
    const product = await client.query(
      `SELECT id FROM products
       WHERE id = $1 AND status <> 'archived'`,
      [productId],
    );

    if (!product.rowCount) {
      throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    }

    // Create initial inventory row if missing.
    // Concurrent admins won't create duplicate rows because
    // product_id is the PRIMARY KEY.
    await client.query(
      `INSERT INTO inventory (product_id)
       VALUES ($1)
       ON CONFLICT (product_id) DO NOTHING`,
      [productId],
    );

    // Lock the inventory row before read-modify-write.
    // WHY: Concurrent admin adjustment/checkout must not
    // overwrite each other's inventory calculations.
    const current = await client.query(
      `SELECT on_hand, reserved
       FROM inventory
       WHERE product_id = $1
       FOR UPDATE`,
      [productId],
    );

    const { on_hand: previous, reserved } = current.rows[0];

    // Can't reduce physical stock below already reserved stock.
    if (newOnHand < reserved) {
      throw new AppError(
        "Stock cannot be lower than reserved quantity",
        409,
        "STOCK_BELOW_RESERVATIONS",
      );
    }

    await client.query(
      `UPDATE inventory
       SET on_hand = $1, updated_at = NOW()
       WHERE product_id = $2`,
      [newOnHand, productId],
    );

    const delta = newOnHand - previous;

    // Only meaningful stock changes are written to audit log.
    if (delta !== 0) {
      await client.query(
        `INSERT INTO inventory_movements
         (product_id, delta_on_hand, reason)
         VALUES ($1, $2, 'stock_adjustment')`,
        [productId, delta],
      );
    }

    return {
      productId,
      onHand: newOnHand,
      reserved,
      available: newOnHand - reserved,
    };
  });
}

// Admin-only full inventory view.
export async function getStock(productId) {
  const result = await pool.query(
    `SELECT
       p.id AS "productId",
       COALESCE(i.on_hand, 0) AS "onHand",
       COALESCE(i.reserved, 0) AS reserved,
       COALESCE(i.on_hand - i.reserved, 0) AS available
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.id = $1`,
    [productId],
  );

  if (!result.rows[0]) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  return result.rows[0];
}
