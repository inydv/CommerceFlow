import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";

// HMAC authenticates the exact HTTP body and timestamp.
// WHY: Anyone should NOT be able to forge "payment.succeeded".
//
// IMPORTANT: This is our LOCAL SIMULATOR protocol.
// A real provider's documented signature format must replace it.
export function verifyWebhook(req, res, next) {
  const timestamp = req.header("X-Demo-Timestamp");
  const signature = req.header("X-Demo-Signature");

  if (
    !/^[0-9]{10}$/.test(timestamp ?? "") ||
    !/^[a-f0-9]{64}$/.test(signature ?? "") ||
    !Buffer.isBuffer(req.rawBody)
  ) {
    return next(
      new AppError(
        "Invalid webhook signature",
        401,
        "INVALID_WEBHOOK_SIGNATURE",
      ),
    );
  }

  // Reject old/future signed requests outside 5-minute window.
  // WHY: A captured request should not be valid indefinitely.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));

  if (age > 300) {
    return next(
      new AppError("Webhook timestamp expired", 401, "WEBHOOK_EXPIRED"),
    );
  }

  const expected = createHmac(
    "sha256",
    Buffer.from(env.PAYMENT_WEBHOOK_SECRET, "hex"),
  )
    .update(`${timestamp}.`)
    .update(req.rawBody)
    .digest();

  const received = Buffer.from(signature, "hex");

  // Equal-length Buffers are required for timingSafeEqual().
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return next(
      new AppError(
        "Invalid webhook signature",
        401,
        "INVALID_WEBHOOK_SIGNATURE",
      ),
    );
  }

  // Only after verification can the request reach our service.
  return next();
}
