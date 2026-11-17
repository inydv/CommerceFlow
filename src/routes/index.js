import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";

const router = Router();

// All business modules versioned API ke andar mount honge.
// WHY: Future API versions add karna simpler rahega.
router.use("/auth", authRoutes);

export default router;
