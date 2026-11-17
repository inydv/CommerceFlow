import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import catalogRoutes from "../modules/catalog/catalog.routes.js";
import inventoryRoutes from "../modules/inventory/inventory.routes.js";
import cartRoutes from "../modules/cart/cart.routes.js";
import orderRoutes from "../modules/orders/order.routes.js";
import paymentRoutes from "../modules/payments/payment.routes.js";
import metricsRoutes from "../common/monitoring/metrics.routes.js";
import reportRoutes from "../modules/reports/report.routes.js";

const router = Router();

// All business modules versioned API ke andar mount honge.
// WHY: Future API versions add karna simpler rahega.
router.use("/auth", authRoutes);
router.use("/", catalogRoutes);
router.use("/", inventoryRoutes);
router.use("/", cartRoutes);
router.use("/", orderRoutes);
router.use("/", paymentRoutes);
router.use("/", metricsRoutes);
router.use("/", reportRoutes);

export default router;
