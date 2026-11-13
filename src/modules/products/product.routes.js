import { Router } from "express";

import { productController } from "./product.controller.js";

import {
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
  productIdSchema,
} from "./product.validation.js";

import { validateRequest } from "../../middleware/validate-request.js";

const router = Router();

// Create a product after validating its request body
router.post(
  "/",
  validateRequest(createProductSchema, "body"),
  productController.createProduct,
);

// Get products with validated pagination query parameters
router.get(
  "/",
  validateRequest(listProductsSchema, "query"),
  productController.getProducts,
);

// Get one product after validating its URL ID
router.get(
  "/:id",
  validateRequest(productIdSchema, "params"),
  productController.getProductById,
);

// Validate both the URL ID and the fields being updated
router.patch(
  "/:id",
  validateRequest(productIdSchema, "params"),
  validateRequest(updateProductSchema, "body"),
  productController.updateProduct,
);

// Validate the URL ID before deleting the product
router.delete(
  "/:id",
  validateRequest(productIdSchema, "params"),
  productController.deleteProduct,
);

export default router;
