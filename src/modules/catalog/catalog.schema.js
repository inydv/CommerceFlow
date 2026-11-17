import { z } from "zod";
import { AppError } from "../../common/errors/app-error.js";

// All API inputs are untrusted.
// WHY: We validate body, path params AND query params.
// WITHOUT THIS: Invalid values reach SQL/business logic.
export function validate(schema, input) {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new AppError("Invalid request data", 400, "VALIDATION_ERROR");
  }

  // Return parsed data, not raw input.
  return result.data;
}

// UUID validation for route parameters.
export const idSchema = z.uuid();

// URL-friendly category slug.
const slug = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

// Category creation.
export const categoryCreateSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  slug,
});

// PATCH permits only provided fields.
// refine prevents empty update requests.
export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field required",
  );

// Product input price is a safe JavaScript integer.
// PostgreSQL uses BIGINT and returns it as a string.
// We will document that response contract.
const priceMinor = z.number().int().min(0).max(1_000_000_000_000);

export const productCreateSchema = z.strictObject({
  sku: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[A-Z0-9_-]+$/),

  name: z.string().trim().min(2).max(200),

  description: z.string().max(5000).nullable().optional(),

  categoryId: z.uuid(),

  priceMinor,

  // No arbitrary currencies until currency support
  // is implemented properly across payments.
  status: z.enum(["draft", "active"]).default("draft"),
});

// SKU immutable for this first Catalog module.
// Client can't set timestamps, IDs or other DB fields.
export const productUpdateSchema = productCreateSchema
  .omit({ sku: true })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field required",
  );

// Query parameters always arrive as strings.
// Limit is bounded to prevent huge response payloads.
export const productListSchema = z.strictObject({
  limit: z
    .string()
    .regex(/^[0-9]+$/)
    .default("20")
    .transform(Number)
    .pipe(z.number().int().min(1).max(100)),

  offset: z
    .string()
    .regex(/^[0-9]+$/)
    .default("0")
    .transform(Number)
    .pipe(z.number().int().min(0).max(1_000_000)),

  categoryId: z.uuid().optional(),
});

// Cursor APIs are forward-only for this version.
//
// WHY: We need a stable sorting key instead of deep OFFSET.
// Cursor is bounded to prevent unreasonably large input.
export const scrollProductSchema = z.strictObject({
  limit: z
    .string()
    .regex(/^[0-9]+$/)
    .default("20")
    .transform(Number)
    .pipe(z.number().int().min(1).max(100)),

  categoryId: z.uuid().optional(),

  cursor: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});
