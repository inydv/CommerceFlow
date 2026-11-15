import { randomUUID } from "node:crypto";

import { pool } from "../../config/database.js";
import { AppError } from "../../errors/app-error.js";
import { invalidateProductCache } from "../products/product-cache.js";

export const orderService = {
  async createOrder({ productId, quantity }) {
    // Reserve one connection for the entire transaction.
    // All queries in a transaction must use the SAME client.
    // pool.query() borrows a connection for an individual query.
    // But a transaction must keep using the same database connection from BEGIN through COMMIT or ROLLBACK.
    const client = await pool.connect();

    try {
      // Start the transaction.
      await client.query("BEGIN");

      // Deduct stock only if enough items are available.
      // The WHERE condition protects against overselling.
      const stockResult = await client.query(
        `
        UPDATE products
        SET stock = stock - $1,
            version = version + 1,
            updated_at = NOW()
        WHERE id = $2
          AND stock >= $1
        RETURNING id, price, stock;
        `,
        [quantity, productId],
      );

      // No updated row means the purchase cannot continue.
      if (stockResult.rowCount === 0) {
        throw new AppError(
          "Product not found or insufficient stock",
          409,
          "INSUFFICIENT_STOCK",
        );
      }

      const product = stockResult.rows[0];

      // Calculate the total inside PostgreSQL using NUMERIC.
      // JavaScript floating-point arithmetic is not suitable
      // for exact money calculations.
      const orderResult = await client.query(
        `
        INSERT INTO orders (
          id,
          product_id,
          quantity,
          unit_price,
          total_amount
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $4::numeric * $3::integer
        )
        RETURNING
          id,
          product_id AS "productId",
          quantity,
          unit_price AS "unitPrice",
          total_amount AS "totalAmount",
          status,
          created_at AS "createdAt";
        `,
        [randomUUID(), productId, quantity, product.price],
      );

      // Both changes are successful.
      // Make them permanent together.
      await client.query("COMMIT");

      await invalidateProductCache(productId);

      return orderResult.rows[0];
    } catch (error) {
      // If anything fails, undo the uncommitted changes.
      // This also releases database row locks.
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        // Keep the original error, but also record rollback failure.
        console.error("Transaction rollback failed:", rollbackError);
      }

      throw error;
    } finally {
      // Always return the connection to the pool.
      // Otherwise requests can exhaust all available connections.
      client.release();
    }
  },
};
