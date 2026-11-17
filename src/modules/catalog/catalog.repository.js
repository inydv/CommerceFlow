import { pool } from "../../config/database.js";

// =====================================================
// CATEGORIES
// =====================================================

export async function insertCategory(data) {
  // RETURNING gets generated UUID without another SELECT.
  const result = await pool.query(
    `INSERT INTO categories (name, slug)
     VALUES ($1, $2)
     RETURNING id, name, slug, is_active, created_at`,
    [data.name, data.slug],
  );

  return result.rows[0];
}

export async function listActiveCategories() {
  const result = await pool.query(
    `SELECT id, name, slug
     FROM categories
     WHERE is_active = TRUE
     ORDER BY name ASC, id ASC`,
  );

  return result.rows;
}

export async function findActiveCategory(id) {
  const result = await pool.query(
    `SELECT id, name, slug
     FROM categories
     WHERE id = $1 AND is_active = TRUE`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function updateCategoryRow(id, data) {
  // SQL column names are fixed allowlisted strings.
  // WHY: Parameterization protects values, NOT identifiers.
  const columns = {
    name: "name",
    slug: "slug",
  };

  const values = [];
  const assignments = [];

  for (const [field, value] of Object.entries(data)) {
    const column = columns[field];

    if (!column) {
      throw new Error("Unsupported category field");
    }

    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  values.push(id);

  const result = await pool.query(
    `UPDATE categories
     SET ${assignments.join(", ")},
         updated_at = NOW()
     WHERE id = $${values.length}
       AND is_active = TRUE
     RETURNING id, name, slug, is_active, updated_at`,
    values,
  );

  return result.rows[0] ?? null;
}

// Archive category instead of physical DELETE.
// Related products remain in PostgreSQL, but our
// public queries will hide inactive categories.
export async function archiveCategoryRow(id) {
  const result = await pool.query(
    `UPDATE categories
     SET is_active = FALSE,
         updated_at = NOW()
     WHERE id = $1 AND is_active = TRUE
     RETURNING id, slug, is_active`,
    [id],
  );

  return result.rows[0] ?? null;
}

// =====================================================
// PRODUCTS
// =====================================================

// Consistent list/detail response fields.
// WHY: Keep database column selection in one trusted place.
const productColumns = `
  p.id,
  p.sku,
  p.name,
  p.description,
  p.category_id AS "categoryId",
  c.name AS "categoryName",
  p.price_minor::text AS "priceMinor",
  p.currency_code AS "currencyCode",
  p.status,
  p.created_at AS "createdAt",
  p.updated_at AS "updatedAt"
`;

// Public API shows only active products
// belonging to active categories.
export async function listProducts(filters) {
  const values = [];

  const conditions = ["p.status = 'active'", "c.is_active = TRUE"];

  if (filters.categoryId) {
    values.push(filters.categoryId);

    conditions.push(`p.category_id = $${values.length}::uuid`);
  }

  // OFFSET can become expensive for deep pages.
  // We'll compare with keyset pagination in performance work.
  values.push(filters.limit);
  const limitParam = values.length;

  values.push(filters.offset);
  const offsetParam = values.length;

  const result = await pool.query(
    `SELECT ${productColumns}
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    values,
  );

  return result.rows;
}

export async function findPublicProduct(id) {
  const result = await pool.query(
    `SELECT ${productColumns}
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1
       AND p.status = 'active'
       AND c.is_active = TRUE`,
    [id],
  );

  return result.rows[0] ?? null;
}

// Admin may inspect draft products and archived records.
export async function findAdminProduct(id) {
  const result = await pool.query(
    `SELECT ${productColumns}
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function insertProduct(data) {
  // INSERT ... SELECT verifies category is active.
  // Foreign key alone only verifies that category exists.
  //
  // WHY: Product shouldn't be created under
  // already archived category.
  const result = await pool.query(
    `INSERT INTO products (
       sku, name, description, category_id,
       price_minor, status
     )
     SELECT $1, $2, $3, c.id, $5, $6
     FROM categories c
     WHERE c.id = $4 AND c.is_active = TRUE
     RETURNING id`,
    [
      data.sku,
      data.name,
      data.description ?? null,
      data.categoryId,
      data.priceMinor,
      data.status,
    ],
  );

  return result.rows[0] ?? null;
}

export async function updateProductRow(id, data) {
  const columns = {
    name: "name",
    description: "description",
    categoryId: "category_id",
    priceMinor: "price_minor",
    status: "status",
  };

  const values = [];
  const assignments = [];

  // Only trusted allowlisted identifiers enter SQL.
  // Actual client values remain parameterized.
  for (const [field, value] of Object.entries(data)) {
    const column = columns[field];

    if (!column) {
      throw new Error("Unsupported product field");
    }

    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  values.push(id);
  const idParam = values.length;

  // If PATCH supplies a new categoryId, check THAT category.
  // WHY: SQL UPDATE's WHERE sees the existing target row;
  // checking p.category_id there could verify the old category
  // instead of the new category being assigned.
  let categoryCondition = "";

  if (data.categoryId) {
    values.push(data.categoryId);
    const categoryParam = values.length;

    categoryCondition = `
    AND EXISTS (
      SELECT 1
      FROM categories c
      WHERE c.id = $${categoryParam}::uuid
        AND c.is_active = TRUE
    )
  `;
  }

  const result = await pool.query(
    `UPDATE products AS p
     SET ${assignments.join(", ")},
         updated_at = NOW()
     WHERE p.id = $${idParam}
       AND p.status <> 'archived'
       ${categoryCondition}
     RETURNING p.id`,
    values,
  );

  return result.rows[0] ?? null;
}

// Soft delete: old order references can continue to work.
export async function archiveProductRow(id) {
  const result = await pool.query(
    `UPDATE products
     SET status = 'archived',
         updated_at = NOW()
     WHERE id = $1 AND status <> 'archived'
     RETURNING id, sku, status`,
    [id],
  );

  return result.rows[0] ?? null;
}

// Keyset pagination using (created_at, id).
// The two columns match the existing composite B-tree
// ordering used by the Catalog indexes.
//
// WHY: Multiple products can have identical timestamps;
// UUID makes the ordering deterministic.
export async function scrollProducts(filters) {
  const values = [];

  const conditions = ["p.status = 'active'", "c.is_active = TRUE"];

  // Category filtering uses the first column of
  // products_active_category_recent_idx.
  if (filters.categoryId) {
    values.push(filters.categoryId);

    conditions.push(`p.category_id = $${values.length}::uuid`);
  }

  if (filters.cursor) {
    values.push(filters.cursor.createdAt);
    const timestampPosition = values.length;

    values.push(filters.cursor.id);
    const idPosition = values.length;

    // DESC ordering means next rows have SMALLER sort keys.
    // SQL row comparison checks timestamp first, UUID second.
    conditions.push(
      `(p.created_at, p.id) <
       ($${timestampPosition}::timestamptz,
        $${idPosition}::uuid)`,
    );
  }

  // Request one additional row to detect a next page.
  values.push(filters.limit + 1);

  const result = await pool.query(
    `SELECT
       p.id,
       p.sku,
       p.name,
       p.price_minor::text AS "priceMinor",
       p.currency_code AS "currencyCode",
       p.category_id AS "categoryId",
       c.name AS "categoryName",

       -- Do NOT convert to JS Date for cursor construction.
       -- Preserve PostgreSQL's six fractional digits.
       to_char(
         p.created_at AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
       ) AS "cursorCreatedAt"

     FROM products p
     JOIN categories c ON c.id = p.category_id

     WHERE ${conditions.join(" AND ")}

     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $${values.length}`,
    values,
  );

  return result.rows;
}
