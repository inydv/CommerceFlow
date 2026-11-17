import { Router } from "express";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";

import * as service from "./catalog.service.js";

import {
  validate,
  idSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  productListSchema,
} from "./catalog.schema.js";

const router = Router();

// Admin operations need valid JWT AND DB-backed admin role.
// WHY: Public customer product prices/catalog modify nahi
// kar sakta. Only client-side hiding is NOT authorization.
const admin = [requireAuth, requireRole("admin")];

// =====================================================
// ADMIN WRITE ENDPOINTS
// =====================================================

router.post("/categories", ...admin, async (req, res) => {
  const input = validate(categoryCreateSchema, req.body);
  const data = await service.createCategory(input);

  return res.status(201).json({ success: true, data });
});

router.patch("/categories/:id", ...admin, async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const input = validate(categoryUpdateSchema, req.body);

  const data = await service.updateCategory(id, input);

  return res.status(200).json({ success: true, data });
});

router.delete("/categories/:id", ...admin, async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const data = await service.archiveCategory(id);

  return res.status(200).json({ success: true, data });
});

router.post("/products", ...admin, async (req, res) => {
  const input = validate(productCreateSchema, req.body);
  const data = await service.createProduct(input);

  return res.status(201).json({ success: true, data });
});

router.patch("/products/:id", ...admin, async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const input = validate(productUpdateSchema, req.body);

  const data = await service.updateProduct(id, input);

  return res.status(200).json({ success: true, data });
});

router.delete("/products/:id", ...admin, async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const data = await service.archiveProduct(id);

  return res.status(200).json({ success: true, data });
});

// Admin can inspect draft/archived products.
// IMPORTANT: Register specific /admin path before
// generic /products/:id style patterns if overlapping.
router.get("/admin/products/:id", ...admin, async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const data = await service.getAdminProduct(id);

  return res.status(200).json({ success: true, data });
});

// =====================================================
// PUBLIC READ ENDPOINTS
// =====================================================

router.get("/categories", async (req, res) => {
  const data = await service.getCategories();

  return res.status(200).json({ success: true, data });
});

router.get("/categories/:id", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const data = await service.getCategory(id);

  return res.status(200).json({ success: true, data });
});

router.get("/products", async (req, res) => {
  const filters = validate(productListSchema, req.query);
  const result = await service.getProducts(filters);

  return res.status(200).json({
    success: true,
    data: result.products,
    pagination: result.pagination,
  });
});

router.get("/products/:id", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const data = await service.getProduct(id);

  return res.status(200).json({ success: true, data });
});

export default router;
