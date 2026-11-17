import { createHmac, randomUUID } from "node:crypto";
import { env } from "../../src/config/env.js";

// Never execute a payment simulator in production.
if (env.NODE_ENV !== "development") {
  throw new Error("Webhook simulator is development-only");
}

// Usage:
// npm run demo:webhook -- payment.succeeded PAYMENT_INTENT_UUID
// npm run demo:webhook -- refund.succeeded REFUND_UUID

const [type, referenceId, suppliedEventId] = process.argv.slice(2);

const allowedTypes = new Set([
  "payment.succeeded",
  "payment.failed",
  "refund.succeeded",
  "refund.failed",
]);

if (!allowedTypes.has(type)) {
  throw new Error("Unsupported webhook event type");
}

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!uuidRegex.test(referenceId ?? "")) {
  throw new Error("Valid reference UUID required");
}

if (suppliedEventId && !uuidRegex.test(suppliedEventId)) {
  throw new Error("Invalid event UUID");
}

// Allow reusing eventId to observe idempotent webhook handling.
// Without supplied ID, each invocation is a new simulated event.
const event = {
  eventId: suppliedEventId ?? randomUUID(),
  type,
  ...(type.startsWith("payment.")
    ? { intentId: referenceId }
    : { refundId: referenceId }),
};

// JSON body is serialized ONCE.
// HMAC must be computed over exact bytes sent.
const rawBody = JSON.stringify(event);

const timestamp = Math.floor(Date.now() / 1000).toString();

const signature = createHmac(
  "sha256",
  Buffer.from(env.PAYMENT_WEBHOOK_SECRET, "hex"),
)
  .update(`${timestamp}.`)
  .update(rawBody)
  .digest("hex");

// Explicit loopback URL: this tool never targets a public service.
const response = await fetch(
  `http://127.0.0.1:${env.PORT}/api/v1/payments/webhooks/demo`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Timestamp": timestamp,
      "X-Demo-Signature": signature,
    },
    body: rawBody,
  },
);

const result = await response.json();

console.log(
  JSON.stringify(
    {
      statusCode: response.status,
      eventId: event.eventId,
      result,
    },
    null,
    2,
  ),
);

if (!response.ok) {
  process.exitCode = 1;
}
