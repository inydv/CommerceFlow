import { AppError } from "../../errors/app-error.js";
import { productRepository } from "./product.repository.js";
import { encodeCursor, decodeCursor } from "../../utils/cursor.js";

export const productService = {
  // Create a product and wait for PostgreSQL to save it
  async createProduct(productData) {
    return await productRepository.create(productData);
  },

  // Get products and calculate pagination information
  async getProducts({ page, limit }) {
    const skip = (page - 1) * limit;

    // Fetch products and their total count at the same time.
    // These queries are independent, so we don't need to wait for one
    // before starting the other.
    const [products, total] = await Promise.all([
      productRepository.findAll({ skip, limit }),
      productRepository.count(),
    ]);

    return {
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  // Find a product or return a 404 error
  async getProductById(id) {
    const product = await productRepository.findById(id);

    if (!product) {
      throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    }

    return product;
  },

  // Update a product or return a 404 error
  async updateProduct(id, updateData) {
    const product = await productRepository.update(id, updateData);

    if (!product) {
      throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    }

    return product;
  },

  // Delete a product or return a 404 error
  async deleteProduct(id) {
    const product = await productRepository.delete(id);

    if (!product) {
      throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    }

    return product;
  },

  // Return a page of products and a cursor for the next page.
  async getProductsByCursor({ cursor, limit }) {
    // Convert the cursor string into timestamp and UUID values.
    const decodedCursor = cursor ? decodeCursor(cursor) : null;

    const result = await productRepository.findByCursor({
      cursor: decodedCursor,
      limit,
    });

    // One extra row means another page exists.
    const hasMore = result.products.length > limit;

    // Only return the number of products requested by the client.
    const products = result.products.slice(0, limit);

    // Build the next cursor from the last returned product.
    // Use the exact database timestamp, not a rounded JS Date.
    const lastPosition = result.positions[products.length - 1];

    const nextCursor =
      hasMore && lastPosition ? encodeCursor(lastPosition) : null;

    return {
      products,
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    };
  },
};
