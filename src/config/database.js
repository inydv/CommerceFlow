import pg from "pg";

import { env } from "./env.js";
import { logger } from "../common/logger/logger.js";

const { Pool } = pg;

// Ek reusable connection pool create kar rahe hain.
// WHY: Har API request ke liye new DB connection
// create karna expensive ho sakta hai.
//
// WITHOUT SHARED POOL: Connections unnecessarily increase
// ho sakti hain aur PostgreSQL resources exhaust ho sakte hain.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,

  // One Node.js process mein maximum 10 DB connections.
  // NOTE: 10 connections ka meaning 10 HTTP requests limit nahi.
  max: 10,

  // DB connection/acquisition ke liye bounded waiting.
  // WHY: Unavailable DB par request indefinitely hang na ho.
  connectionTimeoutMillis: 3000,

  // Unused connections ko eventually close karne ki setting.
  idleTimeoutMillis: 30000,

  // Long-running SQL statement ko cancel karne ka server-side limit.
  // WHY: Unexpectedly slow queries resources indefinitely
  // occupy na karein.
  statement_timeout: 15000,
});

// Idle PostgreSQL connection kabhi network issue se fail ho sakti hai.
// WHY: Error event handle nahi kiya toh unhandled error
// Node.js process crash kar sakta hai.
pool.on("error", (error) => {
  logger.error({ err: error }, "Unexpected PostgreSQL pool error");
});

// Startup ke waqt actual DB query execute kar rahe hain.
// WHY: new Pool() alone successful DB connectivity prove nahi karta.
export async function connectDatabase() {
  await pool.query("SELECT 1");

  logger.info("PostgreSQL connected successfully");
}

// Readiness check current database availability verify karega.
// Startup par connection working thi, iska matlab ye nahi ki
// DB future mein kabhi disconnect nahi hogi.
export async function checkDatabase() {
  await pool.query("SELECT 1");
}

// Application shutdown ke waqt pool drain karo.
// WHY: Open DB connections properly release hon.
export async function closeDatabase() {
  await pool.end();

  logger.info("PostgreSQL connection pool closed");
}
