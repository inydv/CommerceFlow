import { AppError } from "../errors/app-error.js";

// Turn the last product's position into a URL-friendly cursor.
// The cursor contains the two values used for sorting.
export const encodeCursor = (product) => {
  const payload = {
    createdAt: product.createdAt,
    id: product.id,
  };

  // Convert JSON into a URL-safe Base64 string.
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
};

// Convert the cursor back into its original values.
export const decodeCursor = (cursor) => {
  try {
    const payload = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );

    // Make sure the cursor contains the expected values.
    if (
      !payload ||
      typeof payload.createdAt !== "string" ||
      Number.isNaN(Date.parse(payload.createdAt)) ||
      typeof payload.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        payload.id,
      )
    ) {
      throw new Error("Invalid cursor data");
    }

    return payload;
  } catch {
    // Bad cursors are client errors, not server failures.
    throw new AppError("Invalid pagination cursor", 400, "INVALID_CURSOR");
  }
};
