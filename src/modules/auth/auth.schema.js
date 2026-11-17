import { z } from "zod";

import { AppError } from "../../common/errors/app-error.js";

// Register request mein sirf intended fields accept honge.
// WHY: Client "role":"admin" bhejkar role assign na kar sake.
export const registerSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(120),

  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),

  // Password hash banne se pehle length validate karo.
  // Uppercase/symbol mandatory rules impose nahi kar rahe,
  // lekin minimum length sufficient honi chahiye.
  password: z.string().min(12).max(128),
});

export const loginSchema = z.strictObject({
  email: z.email().transform((value) => value.trim().toLowerCase()),

  password: z.string().min(1),
});

// Refresh aur logout mein only opaque token accept hoga.
export const refreshSchema = z.strictObject({
  refreshToken: z.string().min(40).max(200),
});

// Common validated input helper.
// WHY: Business services receive trusted structure/types,
// rather than raw client-submitted objects.
export function parseInput(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new AppError("Request validation failed", 400, "VALIDATION_ERROR");
  }

  return result.data;
}
