import { AppError } from "../../common/errors/app-error.js";

import { logger } from "../../common/logger/logger.js";

import {
  withCatalogCache,
  invalidateCatalogCache,
} from "../../common/cache/catalog-cache.js";

import { encodeCursor, decodeCursor } from "./catalog.cursor.js";

import * as db from "./catalog.repository.js";

// =====================================================
// DATABASE ERROR HANDLING
// =====================================================

// PostgreSQL error codes ko readable API errors mein
// convert karte hain.
//
// WHY: Client ko raw SQL/constraint details expose
// nahi karni chahiye.
//
// WITHOUT THIS: Duplicate SKU/slug ke liye generic
// HTTP 500 mil sakta hai instead of meaningful 409.
function handleDatabaseError(error) {
  // Already known application error ko unchanged rethrow.
  if (error instanceof AppError) {
    throw error;
  }

  // 23505 = UNIQUE constraint violation.
  if (error.code === "23505") {
    throw new AppError(
      "Category slug or product SKU already exists",
      409,
      "DUPLICATE_RESOURCE",
    );
  }

  // 23503 = FOREIGN KEY violation.
  if (error.code === "23503") {
    throw new AppError(
      "Referenced category does not exist",
      400,
      "INVALID_CATEGORY",
    );
  }

  // 23514 = CHECK constraint violation.
  if (error.code === "23514") {
    throw new AppError(
      "Database constraint rejected the input",
      400,
      "INVALID_DATA",
    );
  }

  // Unknown database error should go to centralized handler.
  throw error;
}

// =====================================================
// CACHE INVALIDATION HELPER
// =====================================================

// Call this AFTER a successful database mutation.
//
// WHY: Redis mein old catalog data available ho sakta hai.
// Example:
// Product price: 50000 -> 45000
// Without invalidation, GET /products old price show karega.
//
// Our Catalog uses generation-based invalidation:
// Redis generation increments, so new GET requests use
// new cache keys.
//
// IMPORTANT:
// PostgreSQL is the source of truth.
// Agar DB write succeed hui but Redis unavailable hai,
// toh write ko failed report nahi karna chahte.
//
// Cache eventually consistent hai. Redis failure par
// stale values cache TTL tak visible reh sakti hain.
async function afterCatalogWrite() {
  try {
    await invalidateCatalogCache();
  } catch (error) {
    // Redis issues should not turn an already committed
    // database mutation into a misleading HTTP 500.
    logger.warn({ err: error }, "Catalog cache invalidation failed");
  }
}

// =====================================================
// CATEGORY — CREATE
// =====================================================

export async function createCategory(input) {
  let category;

  try {
    // 1. Insert category into PostgreSQL.
    category = await db.insertCategory(input);
  } catch (error) {
    handleDatabaseError(error);
  }

  // 2. Database write successful -> invalidate cache.
  //
  // WITHOUT THIS: Cached GET /categories may not
  // show the newly created category until TTL expiry.
  await afterCatalogWrite();

  // 3. Return created category.
  return category;
}

// =====================================================
// CATEGORY — LIST
// =====================================================

export async function getCategories() {
  // Cache public category listing.
  //
  // WHY: Categories rarely change compared with
  // how frequently customers browse them.
  return withCatalogCache(
    {
      resource: "active-categories",
    },
    () => db.listActiveCategories(),
  );
}

// =====================================================
// CATEGORY — DETAILS
// =====================================================

export async function getCategory(id) {
  // This endpoint currently reads PostgreSQL directly.
  const category = await db.findActiveCategory(id);

  if (!category) {
    throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  }

  return category;
}

// =====================================================
// CATEGORY — UPDATE
// =====================================================

export async function updateCategory(id, input) {
  let category;

  try {
    // 1. Persist updated name/slug.
    category = await db.updateCategoryRow(id, input);

    if (!category) {
      throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
    }
  } catch (error) {
    handleDatabaseError(error);
  }

  // 2. Invalidate cached categories AND product listings.
  //
  // WHY: Products response includes categoryName.
  // Agar category ka naam change hua, cached products
  // mein bhi old categoryName reh sakta hai.
  await afterCatalogWrite();

  return category;
}

// =====================================================
// CATEGORY — ARCHIVE
// =====================================================

export async function archiveCategory(id) {
  let category;

  try {
    // 1. Soft-delete: is_active = FALSE.
    category = await db.archiveCategoryRow(id);

    if (!category) {
      throw new AppError(
        "Category not found or already archived",
        404,
        "CATEGORY_NOT_FOUND",
      );
    }
  } catch (error) {
    handleDatabaseError(error);
  }

  // 2. Invalidate entire public Catalog cache.
  //
  // WHY: Public product queries exclude products
  // belonging to inactive categories.
  //
  // WITHOUT THIS: Archived category ke products
  // cached listing mein temporarily visible reh sakte hain.
  await afterCatalogWrite();

  return category;
}

// =====================================================
// PRODUCT — CREATE
// =====================================================

export async function createProduct(input) {
  let product;

  try {
    // 1. Insert new product.
    const created = await db.insertProduct(input);

    // Repository returns null if selected category
    // is missing or inactive.
    if (!created) {
      throw new AppError("Active category not found", 400, "INVALID_CATEGORY");
    }

    // 2. Fetch complete admin product representation.
    //
    // WHY: INSERT originally returns product ID only;
    // API response should include product information.
    product = await db.findAdminProduct(created.id);
  } catch (error) {
    handleDatabaseError(error);
  }

  // 3. Product successfully inserted -> invalidate.
  //
  // If status = active, new product should appear
  // in public listing.
  //
  // If status = draft, invalidating is harmless and
  // keeps the implementation straightforward.
  await afterCatalogWrite();

  return product;
}

// =====================================================
// PRODUCT — LIST (OFFSET PAGINATION)
// =====================================================

export async function getProducts(filters) {
  return withCatalogCache(
    {
      // Different filters create different cache keys.
      //
      // WHY: Category A / Category B must never
      // accidentally share the same cached result.
      resource: "active-products",

      categoryId: filters.categoryId ?? null,
      limit: filters.limit,
      offset: filters.offset,
    },
    async () => {
      // Cache miss -> PostgreSQL query.
      const products = await db.listProducts(filters);

      return {
        products,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          returned: products.length,
        },
      };
    },
  );
}

// =====================================================
// PRODUCT — DETAILS (PUBLIC)
// =====================================================

export async function getProduct(id) {
  return withCatalogCache(
    {
      resource: "active-product-detail",
      id,
    },
    async () => {
      // Only active products of active categories
      // are returned by this repository function.
      const product = await db.findPublicProduct(id);

      if (!product) {
        throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
      }

      return product;
    },
  );
}

// =====================================================
// PRODUCT — DETAILS (ADMIN)
// =====================================================

export async function getAdminProduct(id) {
  // Admin must see draft/archived product records too.
  //
  // Keep admin reads uncached for simplicity.
  const product = await db.findAdminProduct(id);

  if (!product) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  return product;
}

// =====================================================
// PRODUCT — UPDATE
// =====================================================

export async function updateProduct(id, input) {
  let product;

  try {
    // 1. Update allowed fields.
    //
    // Price, name, category and status can affect
    // public Catalog response.
    const updated = await db.updateProductRow(id, input);

    if (!updated) {
      throw new AppError(
        "Editable product or active category not found",
        404,
        "PRODUCT_NOT_FOUND",
      );
    }

    // 2. Fetch updated product.
    product = await db.findAdminProduct(updated.id);
  } catch (error) {
    handleDatabaseError(error);
  }

  // 3. Invalidate cached listing and product detail.
  //
  // WITHOUT THIS:
  // Database price = 42000
  // Redis price    = 45000
  //
  // Public API could temporarily return stale price.
  //
  // Checkout must still read current DB price,
  // never cached price.
  await afterCatalogWrite();

  return product;
}

// =====================================================
// PRODUCT — ARCHIVE
// =====================================================

export async function archiveProduct(id) {
  let product;

  try {
    // 1. Soft-delete product: status = archived.
    product = await db.archiveProductRow(id);

    if (!product) {
      throw new AppError(
        "Product not found or already archived",
        404,
        "PRODUCT_NOT_FOUND",
      );
    }
  } catch (error) {
    handleDatabaseError(error);
  }

  // 2. Invalidate cache.
  //
  // WHY: Product should no longer appear in public
  // listing or public detail endpoint.
  //
  // WITHOUT INVALIDATION:
  // Redis could temporarily serve archived product.
  await afterCatalogWrite();

  return product;
}

// =====================================================
// PRODUCT — CURSOR / KEYSET PAGINATION
// =====================================================

export async function scrollProductCatalog(filters) {
  // First page -> no cursor.
  // Next pages -> validate encoded position.
  const cursor = filters.cursor
    ? decodeCursor(filters.cursor, filters.categoryId)
    : null;

  // Cursor-based pagination currently reads PostgreSQL.
  //
  // WHY: Each cursor usually represents a different page,
  // so caching every cursor may give low hit rates.
  const rows = await db.scrollProducts({
    ...filters,
    cursor,
  });

  // One additional row determines whether a next page exists.
  const hasMore = rows.length > filters.limit;

  // Don't return the extra lookahead row.
  const pageRows = rows.slice(0, filters.limit);

  // Next cursor must point to the LAST RETURNED row.
  //
  // WITHOUT THIS: Using lookahead row would skip a product.
  const lastRow = pageRows.at(-1);

  const nextCursor =
    hasMore && lastRow ? encodeCursor(lastRow, filters.categoryId) : null;

  // Internal cursor timestamp is not part of product API.
  const products = pageRows.map(({ cursorCreatedAt, ...product }) => product);

  return {
    products,
    pagination: {
      limit: filters.limit,
      returned: products.length,
      hasMore,
      nextCursor,
    },
  };
}

// Admin batch lookup reads PostgreSQL directly.
// WHY: Admin may need draft/archived product records.
// Public Catalog cache must not leak internal records.
export async function getProductsByIds(ids) {
  return db.findProductsByIds(ids);
}
