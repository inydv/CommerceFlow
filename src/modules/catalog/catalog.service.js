import { AppError } from "../../common/errors/app-error.js";
import * as db from "./catalog.repository.js";

// PostgreSQL constraint codes:
// 23505 = UNIQUE violation
// 23503 = FOREIGN KEY violation
// 23514 = CHECK violation
//
// WHY: Raw database error details client ko expose
// nahi karni; stable API error codes return karenge.
function handleDatabaseError(error) {
  if (error instanceof AppError) throw error;

  if (error.code === "23505") {
    throw new AppError(
      "Category slug or product SKU already exists",
      409,
      "DUPLICATE_RESOURCE",
    );
  }

  if (error.code === "23503") {
    throw new AppError(
      "Referenced category does not exist",
      400,
      "INVALID_CATEGORY",
    );
  }

  if (error.code === "23514") {
    throw new AppError(
      "Database constraint rejected the input",
      400,
      "INVALID_DATA",
    );
  }

  throw error;
}

export async function createCategory(input) {
  try {
    return await db.insertCategory(input);
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function getCategories() {
  return db.listActiveCategories();
}

export async function getCategory(id) {
  const category = await db.findActiveCategory(id);

  if (!category) {
    throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  }

  return category;
}

export async function updateCategory(id, input) {
  try {
    const category = await db.updateCategoryRow(id, input);

    if (!category) {
      throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
    }

    return category;
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function archiveCategory(id) {
  const result = await db.archiveCategoryRow(id);

  if (!result) {
    throw new AppError(
      "Category not found or already archived",
      404,
      "CATEGORY_NOT_FOUND",
    );
  }

  return result;
}

export async function createProduct(input) {
  try {
    const created = await db.insertProduct(input);

    if (!created) {
      throw new AppError("Active category not found", 400, "INVALID_CATEGORY");
    }

    return db.findAdminProduct(created.id);
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function getProducts(filters) {
  const products = await db.listProducts(filters);

  return {
    products,
    pagination: {
      limit: filters.limit,
      offset: filters.offset,
      returned: products.length,
    },
  };
}

export async function getProduct(id) {
  const product = await db.findPublicProduct(id);

  if (!product) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  return product;
}

export async function getAdminProduct(id) {
  const product = await db.findAdminProduct(id);

  if (!product) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  return product;
}

export async function updateProduct(id, input) {
  try {
    const updated = await db.updateProductRow(id, input);

    if (!updated) {
      throw new AppError(
        "Editable product or active category not found",
        404,
        "PRODUCT_NOT_FOUND",
      );
    }

    return db.findAdminProduct(updated.id);
  } catch (error) {
    handleDatabaseError(error);
  }
}

export async function archiveProduct(id) {
  const result = await db.archiveProductRow(id);

  if (!result) {
    throw new AppError(
      "Product not found or already archived",
      404,
      "PRODUCT_NOT_FOUND",
    );
  }

  return result;
}
