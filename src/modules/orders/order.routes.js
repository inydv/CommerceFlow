import { Router } from "express";

import { orderController } from "./order.controller.js";
import { createOrderSchema } from "./order.validation.js";
import { validateRequest } from "../../middleware/validate-request.js";

const router = Router();

// Validate the request before creating an order.
router.post(
  "/",
  validateRequest(createOrderSchema, "body"),
  orderController.createOrder,
);

export default router;
