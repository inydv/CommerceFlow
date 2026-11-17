import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { pool } from "../../src/config/database.js";
import { logger } from "../../src/common/logger/logger.js";

// URL-based path use kar rahe hain.
// WHY: Script project root ke alawa kisi aur working
// directory se run ho toh bhi SQL files locate hon.
const migrationDirectory = new URL(
  "../../src/database/migrations/",
  import.meta.url,
);

async function migrate() {
  // Same connection mein poori transaction execute hogi.
  // WITHOUT SAME CLIENT: BEGIN aur COMMIT different
  // DB connections par ja sakte hain.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Cooperative transaction-level lock.
    // WHY: Do migration runners ek saath apply na karein.
    await client.query("SELECT pg_advisory_xact_lock(2026, 1001)");

    // Applied migrations ka permanent record.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(migrationDirectory))
      .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
      .sort();

    const existing = await client.query(
      "SELECT name, checksum FROM schema_migrations",
    );

    const applied = new Map(
      existing.rows.map((row) => [row.name, row.checksum]),
    );

    // Previously applied file missing ho toh migration history
    // inconsistent hai. Silently proceed nahi karenge.
    for (const name of applied.keys()) {
      if (!files.includes(name)) {
        throw new Error(`Applied migration missing: ${name}`);
      }
    }

    for (const name of files) {
      const sql = await readFile(new URL(name, migrationDirectory), "utf8");

      // Checksum already-applied SQL modifications detect karega.
      const checksum = createHash("sha256").update(sql).digest("hex");

      if (applied.has(name)) {
        if (applied.get(name) !== checksum) {
          throw new Error(`Applied migration changed: ${name}`);
        }

        logger.info({ name }, "Migration already applied");
        continue;
      }

      // Trusted, version-controlled SQL execute karo.
      await client.query(sql);

      // SQL changes aur history same transaction mein save hongi.
      await client.query(
        `INSERT INTO schema_migrations (name, checksum)
         VALUES ($1, $2)`,
        [name, checksum],
      );

      logger.info({ name }, "Migration applied");
    }

    await client.query("COMMIT");
  } catch (error) {
    // Failure par transaction changes undo karo.
    await client.query("ROLLBACK");
    throw error;
  } finally {
    // Connection leak prevent karo.
    client.release();
  }
}

try {
  await migrate();
} catch (error) {
  logger.error({ err: error }, "Migration failed");
  process.exitCode = 1;
} finally {
  // CLI complete hone par pool close karna zaruri hai.
  await pool.end();
}
