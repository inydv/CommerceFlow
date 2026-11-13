import { randomUUID } from "node:crypto";

import { pool } from "../../config/database.js";

// PostgreSQL uses snake_case column names.
// Our API uses camelCase property names.
// This function converts database rows into API-friendly objects.
const mapProduct = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,

    // PostgreSQL NUMERIC is returned as a string by pg.
    // Keep it as a string to avoid losing money precision.
    price: row.price,

    stock: row.stock,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const productRepository = {
  // Insert a new product into PostgreSQL
  async create(productData) {
    const id = randomUUID();

    const query = `
      INSERT INTO products (
        id,
        name,
        description,
        price,
        stock,
        category
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    // Values are passed separately from SQL.
    // PostgreSQL safely handles them as query parameters.
    const values = [
      id,
      productData.name,
      productData.description ?? null,
      productData.price,
      productData.stock,
      productData.category,
    ];

    // Do not build SQL by directly inserting user input.
    // const query = `SELECT * FROM products WHERE id = '${id}';`;
    // If an attacker supplies specially crafted SQL input, directly concatenating it can create an SQL injection vulnerability.
    const result = await pool.query(query, values);

    // RETURNING gives us the newly inserted database row.
    return mapProduct(result.rows[0]);
  },

  // Get products for a particular page
  async findAll({ skip, limit }) {
    const query = `
      SELECT *
      FROM products
      ORDER BY created_at DESC, id DESC
      LIMIT $1
      OFFSET $2;
    `;

    const result = await pool.query(query, [limit, skip]);

    return result.rows.map(mapProduct);
  },

  // Count all products in the database
  async count() {
    const query = `
      SELECT COUNT(*) AS total
      FROM products;
    `;

    const result = await pool.query(query);

    // PostgreSQL COUNT returns BIGINT, which pg returns as a string.
    return Number(result.rows[0].total);
  },

  // Find one product using its UUID
  async findById(id) {
    const query = `
      SELECT *
      FROM products
      WHERE id = $1;
    `;

    const result = await pool.query(query, [id]);

    return mapProduct(result.rows[0]);
  },

  // Update only the fields supplied by the client
  async update(id, updateData) {
    // Only these fields are allowed to become SQL column names.
    // Never insert raw user input into SQL identifiers.
    const allowedColumns = {
      name: "name",
      description: "description",
      price: "price",
      stock: "stock",
      category: "category",
    };

    const values = [id];
    const assignments = [];

    // Build an UPDATE statement containing only supplied fields.
    for (const [field, value] of Object.entries(updateData)) {
      const column = allowedColumns[field];

      // Ignore anything that is not in our allowed field list.
      if (!column) {
        continue;
      }

      values.push(value);

      // $1 is reserved for the product ID.
      // The next parameter number depends on the number of fields.
      assignments.push(`${column} = $${values.length}`);
    }

    // Always update the modification timestamp.
    assignments.push("updated_at = NOW()");

    const query = `
      UPDATE products
      SET ${assignments.join(", ")}
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    return mapProduct(result.rows[0]);
  },

  // Delete a product and return the deleted database row
  async delete(id) {
    const query = `
      DELETE FROM products
      WHERE id = $1
      RETURNING *;
    `;

    const result = await pool.query(query, [id]);

    return mapProduct(result.rows[0]);
  },

  // Get the next group of products using keyset pagination.
  async findByCursor({ cursor, limit }) {
    // Keep the exact PostgreSQL timestamp for our cursor.
    // JavaScript Date objects lose microsecond precision.
    const columns = `
    *,
    created_at::text AS cursor_created_at
  `;

    // The first page doesn't need a cursor condition.
    // Separate queries also avoid an unnecessary OR condition.
    const query = cursor
      ? `
      SELECT ${columns}
      FROM products
      WHERE (created_at, id) < ($1::timestamptz, $2::uuid)
      ORDER BY created_at DESC, id DESC
      LIMIT $3;
    `
      : `
      SELECT ${columns}
      FROM products
      ORDER BY created_at DESC, id DESC
      LIMIT $1;
    `;

    const values = cursor
      ? [cursor.createdAt, cursor.id, limit + 1]
      : [limit + 1];

    const result = await pool.query(query, values);

    // Keep the raw rows so we can build an exact cursor.
    return {
      products: result.rows.map(mapProduct),
      positions: result.rows.map((row) => ({
        createdAt: row.cursor_created_at,
        id: row.id,
      })),
    };
  },
};
