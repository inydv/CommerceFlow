import pg from "pg";

import { env } from "./env.js";
import { logger } from "./logger.js";

const { Pool } = pg;

// A pool keeps database connections available for reuse.
// This avoids creating a completely new connection for every API request.
export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,

  // Do not allow more than this many connections at once
  max: env.DB_POOL_MAX,

  // Wait up to 5 seconds when a new connection is needed
  connectionTimeoutMillis: 5000,

  // Close an unused connection after 30 seconds
  idleTimeoutMillis: 30000,
});

// Listen for errors on connections that are sitting unused in the pool.
// This is useful because these errors might happen outside an API request.
pool.on("error", (error) => {
  logger.error(
    { err: error },
    "Unexpected error on an idle PostgreSQL connection",
  );
});
