import { Router } from "express";

import { env } from "../config/env.js";

import healthRoutes from "../modules/health/health.routes.js";
import productRoutes from "../modules/products/product.routes.js";
import orderRoutes from "../modules/orders/order.routes.js";
import performanceRoutes from "../modules/performance/performance.routes.js";

// Main router keeps all API module routes in one place
const router = Router();

// Health endpoints
router.use("/health", healthRoutes);

// Product endpoints
router.use("/products", productRoutes);

// Order endpoints
router.use("/orders", orderRoutes);

// Performance experiments are available only in development.
if (env.NODE_ENV === "development") {
  router.use("/performance", performanceRoutes);
}

export default router;
