import { productService } from "./product.service.js";

export const productController = {
  // POST /api/v1/products
  createProduct(req, res) {
    const product = productService.createProduct(req.validated.body);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  },

  // GET /api/v1/products
  getProducts(req, res) {
    const result = productService.getProducts(req.validated.query);

    res.status(200).json({
      success: true,
      data: result.products,
      pagination: result.pagination,
    });
  },

  // GET /api/v1/products/:id
  getProductById(req, res) {
    const product = productService.getProductById(req.validated.params.id);

    res.status(200).json({
      success: true,
      data: product,
    });
  },

  // PATCH /api/v1/products/:id
  updateProduct(req, res) {
    const product = productService.updateProduct(
      req.validated.params.id,
      req.validated.body,
    );

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  },

  // DELETE /api/v1/products/:id
  deleteProduct(req, res) {
    const product = productService.deleteProduct(req.validated.params.id);

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: product,
    });
  },
};
