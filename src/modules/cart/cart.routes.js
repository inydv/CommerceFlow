import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../common/errors/app-error.js";
import { requireAuth } from "../auth/auth.middleware.js";
import * as cart from "./cart.service.js";

const router = Router();

const itemSchema = z.strictObject({
  quantity: z.number().int().min(1).max(100),
});

function parse(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new AppError("Invalid input", 400, "VALIDATION_ERROR");
  }

  return result.data;
}

// Every cart endpoint requires authenticated customer identity.
// User ID comes from verified JWT + current database user,
// never from a client-controlled userId parameter.
router.use("/cart", requireAuth);

router.get("/cart", async (req, res) => {
  const data = await cart.getCart(req.user.id);
  return res.json({ success: true, data });
});

router.put("/cart/items/:productId", async (req, res) => {
  const productId = parse(z.uuid(), req.params.productId);
  const { quantity } = parse(itemSchema, req.body);

  const data = await cart.setCartItem(req.user.id, productId, quantity);

  return res.json({ success: true, data });
});

router.delete("/cart/items/:productId", async (req, res) => {
  const productId = parse(z.uuid(), req.params.productId);

  const data = await cart.removeCartItem(req.user.id, productId);

  return res.json({ success: true, data });
});

export default router;
