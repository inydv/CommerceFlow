import app from "./app.js";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

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

// Handle errors that occur while starting or running the HTTP server
server.on("error", (error) => {
  logger.fatal({ err: error }, "HTTP server failed");

  // Exit because the server cannot operate correctly
  process.exit(1);
});
