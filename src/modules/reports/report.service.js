import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { pool } from "../../config/database.js";
import { logger } from "../../common/logger/logger.js";

// Each query fetches at most 500 rows.
// WHY: Exporting 100,000 products must not build
// one giant array in application memory.
const BATCH_SIZE = 500;

// Protect against an accidental unbounded export.
const MAX_ROWS = 100_000;

// CSV escaping must handle commas, quotes and line breaks.
//
// Security: Spreadsheet applications can interpret strings
// beginning with =,+,-,@ as formulas.
//
// Prefix potentially executable cells with a tab inside
// quoted CSV content. For strict spreadsheet import security,
// downstream import settings must also treat values as text.
function csvCell(value) {
  if (value === null || value === undefined) {
    return '""';
  }

  let text = String(value);

  // Prevent common CSV/spreadsheet formula injection.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `\t${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values) {
  return values.map(csvCell).join(",") + "\n";
}

// Generator reads one SQL batch at a time.
//
// WHY: Node streams request more data as the destination
// consumes it, avoiding a huge output buffer.
async function* productCsvRows(signal) {
  yield csvRow([
    "product_id",
    "sku",
    "name",
    "category_id",
    "price_minor",
    "status",
    "created_at",
  ]);

  let lastId = null;
  let exported = 0;

  while (!signal.aborted && exported < MAX_ROWS) {
    const remaining = MAX_ROWS - exported;
    const batchLimit = Math.min(BATCH_SIZE, remaining);

    // Keyset pagination on primary key.
    // WHY: OFFSET gets more expensive as dataset grows.
    //
    // IMPORTANT: This export is NOT a consistent DB snapshot.
    // Concurrent catalog writes may change records during export.
    const result = await pool.query(
      `SELECT
         id, sku, name, category_id,
         price_minor::text AS price_minor,
         status, created_at
       FROM products
       WHERE ($1::uuid IS NULL OR id > $1::uuid)
       ORDER BY id ASC
       LIMIT $2`,
      [lastId, batchLimit],
    );

    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      if (signal.aborted) return;

      yield csvRow([
        row.id,
        row.sku,
        row.name,
        row.category_id,
        row.price_minor,
        row.status,
        row.created_at.toISOString(),
      ]);

      exported++;
    }

    lastId = result.rows.at(-1).id;
  }
}

export async function streamCatalogCsv(req, res) {
  const controller = new AbortController();

  // If the browser disconnects, stop further database fetching.
  res.once("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="commerceflow-products.csv"',
  );

  res.setHeader("Cache-Control", "no-store");

  try {
    // Readable.from() converts async generator into a stream.
    // pipeline() handles backpressure and downstream errors.
    await pipeline(Readable.from(productCsvRows(controller.signal)), res, {
      signal: controller.signal,
    });
  } catch (error) {
    // CSV headers may already have been sent.
    // Never try to send JSON into a partial CSV response.
    if (!controller.signal.aborted) {
      logger.error({ err: error }, "CSV export failed");
    }

    // Express connection is normally destroyed by pipeline
    // when streaming fails. Propagate only if headers
    // weren't already sent and connection is still usable.
    if (!res.headersSent && !res.destroyed) {
      throw error;
    }
  }
}
