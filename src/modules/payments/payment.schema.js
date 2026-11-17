import { z } from "zod";
import { AppError } from "../../common/errors/app-error.js";

// Use strict input schemas so clients cannot silently
// add unsupported fields, payment amounts or statuses.
export const intentSchema = z.strictObject({
  orderId: z.uuid(),
});

export const refundSchema = z.strictObject({
  orderId: z.uuid(),
});

// These events represent verified development-provider messages.
// Clients cannot directly choose an order's paid/refunded state.
export const webhookSchema = z.discriminatedUnion("type", [
  z.strictObject({
    eventId: z.uuid(),
    type: z.literal("payment.succeeded"),
    intentId: z.uuid(),
  }),
  z.strictObject({
    eventId: z.uuid(),
    type: z.literal("payment.failed"),
    intentId: z.uuid(),
  }),
  z.strictObject({
    eventId: z.uuid(),
    type: z.literal("refund.succeeded"),
    refundId: z.uuid(),
  }),
  z.strictObject({
    eventId: z.uuid(),
    type: z.literal("refund.failed"),
    refundId: z.uuid(),
  }),
]);

export function validate(schema, value) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AppError("Invalid request data", 400, "VALIDATION_ERROR");
  }

  return result.data;
}
