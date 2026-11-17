import { Router } from "express";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";

import { streamCatalogCsv } from "./report.service.js";

const router = Router();

// Admin-only CSV export.
//
// WHY: This includes draft and archived product metadata,
// not just public active products.
router.get(
  "/admin/reports/products.csv",
  requireAuth,
  requireRole("admin"),
  streamCatalogCsv,
);

export default router;
