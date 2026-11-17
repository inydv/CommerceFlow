import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../modules/auth/auth.middleware.js";

import { getRuntimeMetrics } from "./runtime-metrics.js";

const router = Router();

// Never make detailed runtime metrics a public route.
//
// WHY: Process information and operational metrics
// should not be exposed to arbitrary internet users.
router.get(
  "/admin/metrics/runtime",
  requireAuth,
  requireRole("admin"),
  (req, res) => {
    return res.json({
      success: true,
      data: getRuntimeMetrics(),
    });
  },
);

export default router;
