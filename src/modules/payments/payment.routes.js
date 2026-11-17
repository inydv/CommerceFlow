import { Router } from "express";

import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";

import {
  intentSchema,
  refundSchema,
  webhookSchema,
  validate,
} from "./payment.schema.js";

import { verifyWebhook } from "./payment.webhook.js";

import {
  createPaymentIntent,
  processWebhook,
  requestRefund,
} from "./payment.service.js";

const router = Router();

// Customer can create an intent only for their own order.
// The actual amount is read from PostgreSQL, not request body.
router.post("/payments/intents", requireAuth, async (req, res) => {
  const { orderId } = validate(intentSchema, req.body);

  const payment = await createPaymentIntent(req.user.id, orderId);

  return res.status(200).json({
    success: true,
    message: "Local payment intent ready",
    data: {
      intentId: payment.id,
      orderId: payment.order_id,
      amountMinor: payment.amount_minor,
      currencyCode: payment.currency_code,
      status: payment.status,
    },
  });
});

// Admin can request a full refund of a paid order.
// Creating a refund record is NOT proof money was returned.
router.post(
  "/payments/refunds",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { orderId } = validate(refundSchema, req.body);

    const refund = await requestRefund(orderId);

    return res.status(200).json({
      success: true,
      data: refund,
    });
  },
);

// IMPORTANT:
// Our simulator webhook must NEVER be exposed in production.
// Real provider integration needs its actual documented
// HMAC/signature process and payment amount verification.
if (env.NODE_ENV === "development") {
  router.post("/payments/webhooks/demo", verifyWebhook, async (req, res) => {
    const event = validate(webhookSchema, req.body);

    const result = await processWebhook(event);

    return res.status(200).json({
      success: true,
      data: result,
    });
  });
}

export default router;
