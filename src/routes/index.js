import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import catalogRoutes from "../modules/catalog/catalog.routes.js";

const router = Router();

// All business modules versioned API ke andar mount honge.
// WHY: Future API versions add karna simpler rahega.
router.use("/auth", authRoutes);
router.use("/", catalogRoutes);

export default router;
