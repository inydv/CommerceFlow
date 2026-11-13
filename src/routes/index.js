import { Router } from "express";

import healthRoutes from "../modules/health/health.routes.js";
import productRoutes from "../modules/products/product.routes.js";

// Main router keeps all API module routes in one place
const router = Router();

// Health endpoints
router.use("/health", healthRoutes);

// Product endpoints
router.use("/products", productRoutes);

export default router;
