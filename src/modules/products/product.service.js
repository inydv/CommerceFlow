import { AppError } from "../../errors/app-error.js";
import { productRepository } from "./product.repository.js";

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
};
