import app from "./app.js";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { pool } from "./config/database.js";

// Start the HTTP server on the configured port
// Server startup is kept separate from Express configuration
const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
    },
    "CommerceFlow API started successfully",
  );
});

// Allow active HTTP requests to finish during shutdown.
const SHUTDOWN_TIMEOUT_MS = 15_000;

let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  // Shutdown should start only once.
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`${signal} received. Starting graceful shutdown...`);

  // Safety deadline: don't leave a broken process running forever.
  const forceTimer = setTimeout(() => {
    console.error("Shutdown timeout reached. Forcing exit.");

    // Force-close remaining HTTP connections.
    // In-flight requests may fail at this point.
    server.closeAllConnections();

    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Stop accepting connections and wait for active requests.
  server.close(async (error) => {
    if (error) {
      console.error("HTTP server close failed:", error);
    } else {
      console.log("HTTP requests completed. Server closed.");
    }

    try {
      // Close PostgreSQL connections after HTTP work finishes.
      await pool.end();

      console.log("PostgreSQL pool closed.");
    } catch (dbError) {
      console.error("Database pool close failed:", dbError);
      error ??= dbError;
    }

    // All resources for this basic experiment are cleaned up.
    clearTimeout(forceTimer);

    // This demo exits after HTTP requests and DB connections
    // are drained. Later we'll explicitly manage background jobs.
    process.exit(error ? 1 : 0);
  });
};

// Ctrl+C usually sends SIGINT.
process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});

// Process managers normally request shutdown using SIGTERM.
process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

// Handle errors that occur while starting or running the HTTP server
server.on("error", (error) => {
  logger.fatal({ err: error }, "HTTP server failed");

  // Exit because the server cannot operate correctly
  process.exit(1);
});
