import { env } from "./config/env.js";
import { app, setReadiness } from "./app.js";
import { logger } from "./common/logger/logger.js";

import { connectDatabase, closeDatabase } from "./config/database.js";

// Graceful shutdown same time par multiple baar nahi chalna chahiye.
let isShuttingDown = false;

async function start() {
  try {
    // FIRST: PostgreSQL connectivity verify karo.
    // WHY: Required database unavailable hai toh HTTP traffic
    // accept karke requests fail nahi karwana chahte.
    await connectDatabase();

    // SECOND: HTTP listener start karo.
    // Promise tab resolve hogi jab server listening start karega.
    const server = await new Promise((resolve, reject) => {
      const instance = app.listen(env.PORT);

      // Port bind successful.
      instance.once("listening", () => resolve(instance));

      // Port already occupied ho toh startup reject.
      instance.once("error", reject);
    });

    // THIRD: All required startup steps successful hain.
    setReadiness(true);

    logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV,
      },
      "CommerceFlow started successfully",
    );

    // Gracefully stop this HTTP server and DB pool.
    async function shutdown(signal) {
      // Duplicate signal par duplicate cleanup avoid karo.
      if (isShuttingDown) return;

      isShuttingDown = true;

      // Immediately report that instance is not ready.
      setReadiness(false);

      logger.info({ signal }, "Shutdown started");

      // Safety deadline.
      // WITHOUT TIMEOUT: Hung requests process ko indefinitely
      // alive rakh sakti hain.
      // Deadline exceed hui toh unfinished work interrupt ho sakta hai.
      const deadline = setTimeout(() => {
        logger.fatal("Shutdown deadline exceeded");
        process.exit(1);
      }, 20000);

      try {
        // New HTTP connections accept karna stop karo.
        // Existing active HTTP requests ko finish hone do.
        await new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });

        // HTTP requests drain hone ke baad DB pool close karo.
        // WHY: Active request ki DB query prematurely interrupt na ho.
        await closeDatabase();

        logger.info("Graceful shutdown completed");
      } catch (error) {
        logger.error({ err: error }, "Shutdown failed");

        process.exitCode = 1;
      } finally {
        clearTimeout(deadline);
      }
    }

    // Ctrl+C -> SIGINT.
    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });

    // Process manager/deployment -> SIGTERM.
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    // DB or HTTP startup failure.
    logger.fatal({ err: error }, "Application startup failed");

    // Even failed startups should release DB resources.
    try {
      await closeDatabase();
    } catch (cleanupError) {
      logger.error(
        { err: cleanupError },
        "Cleanup after startup failure failed",
      );
    }

    process.exitCode = 1;
  }
}

// Application execution starts here.
await start();
