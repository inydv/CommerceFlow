import { z } from "zod";

// The client tells us what product and quantity they want.
// The server calculates the price using database values.
export const createOrderSchema = z
  .object({
    productId: z.string().uuid(),

    quantity: z.coerce.number().int().positive().max(100),
  })
  .strict();
