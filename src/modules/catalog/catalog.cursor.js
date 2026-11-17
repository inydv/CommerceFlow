import { z } from "zod";

import { AppError } from "../../common/errors/app-error.js";

// The cursor stores exact PostgreSQL microsecond timestamps.
// WHY: JavaScript Date only keeps milliseconds.
// Rounding an ordering key can skip records.
const cursorSchema = z.strictObject({
  version: z.literal(1),

  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),

  id: z.uuid(),

  // Filter consistency: cursor from one category must
  // not be reused for another category.
  categoryId: z.uuid().nullable(),
});

// Public catalog cursor is not a security token.
// Base64URL encoding makes it transport-friendly,
// but it does NOT encrypt/sign its contents.
export function encodeCursor(row, categoryId) {
  const payload = {
    version: 1,
    createdAt: row.cursorCreatedAt,
    id: row.id,
    categoryId: categoryId ?? null,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(value, categoryId) {
  try {
    const raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

    const cursor = cursorSchema.parse(raw);

    if (cursor.categoryId !== (categoryId ?? null)) {
      throw new Error("Cursor category mismatch");
    }

    return cursor;
  } catch {
    throw new AppError("Invalid pagination cursor", 400, "INVALID_CURSOR");
  }
}
