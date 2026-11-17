import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../common/errors/app-error.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";

import * as service from "./inventory.service.js";

const router = Router();

const stockSchema = z.strictObject({
  // Bound stock quantity: avoid integer overflow or
  // accidentally loading unrealistic stock numbers.
  onHand: z.number().int().min(0).max(10_000_000),
});

function parse(schema, value) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AppError("Invalid input", 400, "VALIDATION_ERROR");
  }

  return result.data;
}

// Admin: set current physical stock.
router.put(
  "/admin/inventory/:productId",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const productId = parse(z.uuid(), req.params.productId);
    const body = parse(stockSchema, req.body);

    const data = await service.setStock(productId, body.onHand);

    return res.status(200).json({ success: true, data });
  },
);

// Admin: see actual stock and reserved stock separately.
router.get(
  "/admin/inventory/:productId",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const productId = parse(z.uuid(), req.params.productId);
    const data = await service.getStock(productId);

    return res.json({ success: true, data });
  },
);

// Public: only available stock, no internal reservation details.
router.get("/inventory/:productId", async (req, res) => {
  const productId = parse(z.uuid(), req.params.productId);
  const data = await service.getAvailability(productId);

  return res.json({ success: true, data });
});

export default router;
