import { AppError } from "../../errors/app-error.js";
import { productRepository } from "./product.repository.js";

export const productService = {
  // Create a product after the request data has been validated
  createProduct(productData) {
    return productRepository.create(productData);
  },

  // Get products and calculate pagination information
  getProducts({ page, limit }) {
    const skip = (page - 1) * limit;

    const products = productRepository.findAll({
      skip,
      limit,
    });

    const total = productRepository.count();

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

  // Get one product or return a 404 error
  getProductById(id) {
    const product = productRepository.findById(id);

    if (!product) {
      throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    }

    return product;
  },

  // Update a product or return a 404 error
  updateProduct(id, updateData) {
    const product = productRepository.update(id, updateData);

    if (!product) {
      throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    }

    return product;
  },

  // Delete a product or return a 404 error
  deleteProduct(id) {
    const product = productRepository.delete(id);

    if (!product) {
      throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    }

    return product;
  },
};
