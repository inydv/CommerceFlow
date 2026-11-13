import { productService } from "./product.service.js";

export const productController = {
  // Create a product
  async createProduct(req, res) {
    const product = await productService.createProduct(req.validated.body);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  },

  // Get products with pagination
  async getProducts(req, res) {
    const result = await productService.getProducts(req.validated.query);

    res.status(200).json({
      success: true,
      data: result.products,
      pagination: result.pagination,
    });
  },

  // Get one product
  async getProductById(req, res) {
    const product = await productService.getProductById(
      req.validated.params.id,
    );

    res.status(200).json({
      success: true,
      data: product,
    });
  },

  // Update a product
  async updateProduct(req, res) {
    const product = await productService.updateProduct(
      req.validated.params.id,
      req.validated.body,
    );

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  },

  // Delete a product
  async deleteProduct(req, res) {
    const product = await productService.deleteProduct(req.validated.params.id);

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: product,
    });
  },
};
