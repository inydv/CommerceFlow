import { pool } from "../../config/database.js";
import { withTransaction } from "../../common/database/transaction.js";
import { AppError } from "../../common/errors/app-error.js";

// One customer = one active cart.
//
// WHY: UNIQUE(user_id) avoids two competing carts.
// ON CONFLICT DO NOTHING is safe for repeat calls.
async function ensureCart(client, userId) {
  await client.query(
    `INSERT INTO carts (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  // Lock cart row for writes.
  // Checkout also locks this same row.
  // WHY: Cart modifications and checkout cannot race.
  const result = await client.query(
    `SELECT id FROM carts
     WHERE user_id = $1
     FOR UPDATE`,
    [userId],
  );

  return result.rows[0].id;
}

export async function getCart(userId, db = pool) {
  const result = await db.query(
    `SELECT
       ci.product_id AS "productId",
       ci.quantity,
       p.name,
       p.sku,
       p.price_minor::text AS "priceMinor",
       p.status,
       c.is_active AS "categoryActive"
     FROM carts cart
     JOIN cart_items ci ON ci.cart_id = cart.id
     JOIN products p ON p.id = ci.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE cart.user_id = $1
     ORDER BY p.name, p.id`,
    [userId],
  );

  // Money stays integer-based: BigInt for exact arithmetic.
  const estimatedTotal = result.rows.reduce(
    (sum, item) => sum + BigInt(item.priceMinor) * BigInt(item.quantity),
    0n,
  );

  return {
    items: result.rows,
    estimatedTotalMinor: estimatedTotal.toString(),
    currencyCode: "INR",
  };
}

// PUT quantity = absolute quantity, not increment.
// WHY: Same HTTP request repeated doesn't double quantity.
export async function setCartItem(userId, productId, quantity) {
  return withTransaction(async (client) => {
    const cartId = await ensureCart(client, userId);

    const product = await client.query(
      `SELECT p.id
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1
         AND p.status = 'active'
         AND c.is_active = TRUE`,
      [productId],
    );

    if (!product.rowCount) {
      throw new AppError("Active product not found", 404, "PRODUCT_NOT_FOUND");
    }

    // Atomic UPSERT: same product has only one cart row.
    await client.query(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, product_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [cartId, productId, quantity],
    );

    await client.query(
      `UPDATE carts
       SET updated_at = NOW()
       WHERE id = $1`,
      [cartId],
    );

    // Cart does not reserve stock.
    // Availability will be checked at checkout.
    return getCart(userId, client);
  });
}

export async function removeCartItem(userId, productId) {
  return withTransaction(async (client) => {
    const cartId = await ensureCart(client, userId);

    // Repeated DELETE is safe: absence isn't an error.
    await client.query(
      `DELETE FROM cart_items
       WHERE cart_id = $1 AND product_id = $2`,
      [cartId, productId],
    );

    await client.query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [
      cartId,
    ]);

    return getCart(userId, client);
  });
}
