
-- CP-06: Catalog and query performance investigation.
--
-- Run after seeding 10k/100k synthetic products.
-- EXPLAIN ANALYZE executes the SELECT and measures its plan.

\timing on

\echo '===== TABLE SIZE ====='

SELECT
    COUNT(*) AS total_products,
    COUNT(*) FILTER (WHERE status = 'active') AS active_products
FROM products;


\echo '===== EXISTING INDEXES ====='

-- WHY: Index create karne se pehle existing structures inspect.
-- Duplicated indexes write cost and storage increase kar sakti hain.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'products'
ORDER BY indexname;


\echo '===== FIRST PAGE ====='

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, sku, name, price_minor
FROM products
WHERE status = 'active'
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 0;


\echo '===== DEEP OFFSET ====='

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, sku, name, price_minor
FROM products
WHERE status = 'active'
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 10000;


\echo '===== PREPARE KEYSET ANCHOR ====='

-- Choose 10,000th active product as cursor position.
-- PostgreSQL text conversion preserves timestamp precision.
SELECT
    created_at::text AS anchor_time,
    id AS anchor_id
FROM products
WHERE status = 'active'
ORDER BY created_at DESC, id DESC
LIMIT 1 OFFSET 9999
\gset


\echo '===== KEYSET AFTER ROW 10000 ====='

-- Same logical next 20 products as OFFSET 10000
-- if the dataset remains unchanged between queries.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, sku, name, price_minor
FROM products
WHERE status = 'active'
  AND (created_at, id) <
      (
        :'anchor_time'::timestamptz,
        :'anchor_id'::uuid
      )
ORDER BY created_at DESC, id DESC
LIMIT 20;


\echo '===== CATEGORY PRODUCT COUNTS ====='

-- GROUP BY, JOIN and aggregation in one SQL operation.
EXPLAIN (ANALYZE, BUFFERS)
SELECT
    c.id,
    c.name,
    COUNT(p.id) AS product_count
FROM categories c
LEFT JOIN products p
    ON p.category_id = c.id
GROUP BY c.id, c.name
ORDER BY product_count DESC
LIMIT 20;
