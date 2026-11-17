import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../auth/auth.middleware.js";
import { AppError } from "../../common/errors/app-error.js";
import * as orders from "./order.service.js";

const router = Router();

function parseUUID(input) {
  const result = z.uuid().safeParse(input);

  if (!result.success) {
    throw new AppError("Invalid UUID", 400, "VALIDATION_ERROR");
  }

  return result.data;
}

// All order endpoints require authenticated user.
// Ownership is checked in SQL using req.user.id.
router.use("/orders", requireAuth);

// Checkout uses a client-generated UUID as idempotency key.
// Clients MUST reuse the same key for retries of one attempt,
// and generate a NEW key for a new checkout.
router.post("/orders/checkout", async (req, res) => {
  const key = parseUUID(req.header("Idempotency-Key"));

  const result = await orders.checkout(req.user.id, key);

  return res.status(result.replayed ? 200 : 201).json({
    success: true,
    replayed: result.replayed,
    data: result.order,
  });
});

// List only the authenticated customer's orders.
router.get("/orders", async (req, res) => {
  const data = await orders.listOrders(req.user.id);

  return res.json({ success: true, data });
});

// Specific checkout route is registered before /orders/:id.
router.get("/orders/:id", async (req, res) => {
  const id = parseUUID(req.params.id);

  const data = await orders.getOrder(req.user.id, id);

  return res.json({ success: true, data });
});

// Cancel only pending-payment orders.
// Already-cancelled orders return their existing state.
router.post("/orders/:id/cancel", async (req, res) => {
  const id = parseUUID(req.params.id);

  const data = await orders.cancelOrder(req.user.id, id);

  return res.json({ success: true, data });
});

export default router;
