import { performance } from "node:perf_hooks";

import { pool } from "../../config/database.js";

// BAD approach: one product query for every order.
export const getOrdersWithNPlusOne = async (limit = 10) => {
  const start = performance.now();

  let queryCount = 0;

  // Query 1: fetch orders.
  const orderResult = await pool.query(
    `SELECT id, product_id, quantity, total_amount, status
     FROM orders
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );

  queryCount += 1;

  const orders = [];

  // BAD: query PostgreSQL once for every order.
  for (const order of orderResult.rows) {
    const productResult = await pool.query(
      `SELECT id, name, category
       FROM products
       WHERE id = $1`,
      [order.product_id],
    );

    queryCount += 1;

    const product = productResult.rows[0] ?? null;

    orders.push({
      id: order.id,
      productId: order.product_id,
      quantity: order.quantity,
      totalAmount: order.total_amount,
      status: order.status,
      productName: product?.name ?? null,
      productCategory: product?.category ?? null,
    });
  }

  return {
    orders,
    metrics: {
      approach: "N_PLUS_ONE",
      ordersReturned: orders.length,
      queryCount,
      durationMs: Number((performance.now() - start).toFixed(2)),
    },
  };
};

// GOOD approach: fetch orders and products together.
export const getOrdersWithJoin = async (limit = 10) => {
  const start = performance.now();

  // One SQL statement returns all required information.
  const result = await pool.query(
    `SELECT
       o.id,
       o.product_id,
       o.quantity,
       o.total_amount,
       o.status,
       p.name AS product_name,
       p.category AS product_category
     FROM orders o
     LEFT JOIN products p
       ON p.id = o.product_id
     ORDER BY o.id DESC
     LIMIT $1`,
    [limit],
  );

  const orders = result.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    quantity: row.quantity,
    totalAmount: row.total_amount,
    status: row.status,
    productName: row.product_name,
    productCategory: row.product_category,
  }));

  return {
    orders,
    metrics: {
      approach: "JOIN",
      ordersReturned: orders.length,
      queryCount: 1,
      durationMs: Number((performance.now() - start).toFixed(2)),
    },
  };
};

// Fetch multiple products with one SQL query.
export const getProductsInBatch = async (productIds) => {
  const start = performance.now();

  // Remove duplicate product IDs.
  const uniqueIds = [...new Set(productIds)];

  const result = await pool.query(
    `SELECT id, name, price, stock, category
     FROM products
     WHERE id = ANY($1::uuid[])`,
    [uniqueIds],
  );

  // PostgreSQL doesn't guarantee rows in the input ID order.
  const productMap = new Map(
    result.rows.map((product) => [product.id, product]),
  );

  // Return products in the same order as the requested unique IDs.
  const products = uniqueIds.map((id) => productMap.get(id)).filter(Boolean);

  return {
    products,
    metrics: {
      requestedIds: productIds.length,
      uniqueIds: uniqueIds.length,
      productsFound: products.length,
      queryCount: 1,
      durationMs: Number((performance.now() - start).toFixed(2)),
    },
  };
};
