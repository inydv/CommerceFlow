import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

import { requestIdMiddleware } from "./middleware/request-id.js";
import { notFoundMiddleware } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

import apiRoutes from "./routes/index.js";

// Create the Express application
// This file configures the application but does not start the server
const app = express();

// Hide the X-Powered-By header so we don't unnecessarily expose Express
app.disable("x-powered-by");

// Generate a unique ID before other middleware runs
app.use(requestIdMiddleware);

// Log incoming HTTP requests and their response details
app.use(
  pinoHttp({
    logger,

    // Include our request ID in HTTP logs
    customProps: (req) => ({
      requestId: req.id,
    }),
  }),
);

// Add security-related HTTP headers
app.use(helmet());

// Configure which frontend origins are allowed to access our API
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

// Parse incoming JSON request bodies
// Limit body size to avoid unnecessarily large requests
app.use(express.json({ limit: "1mb" }));

// Parse form-urlencoded request bodies
app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  }),
);

// Register all API routes under version 1
// Example: /api/v1/health
app.use("/api/v1", apiRoutes);

// If no route matches, create a 404 error
app.use(notFoundMiddleware);

// Handle all application errors in one place
// This must be registered after the routes
app.use(errorHandler);

export default app;
