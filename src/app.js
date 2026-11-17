import express from "express";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import compression from "compression";

import { logger } from "./common/logger/logger.js";
import { AppError } from "./common/errors/app-error.js";
import { errorHandler } from "./common/middleware/error-handler.js";
import { checkDatabase } from "./config/database.js";
import { checkRedis } from "./config/redis.js";
import { httpMetrics } from "./common/monitoring/http-metrics.js";

import apiRoutes from "./routes/index.js";

// Express app create hoti hai.
// Yahan HTTP listener start nahi karte.
// WHY: Routing configuration aur server lifecycle separate rahe.
export const app = express();

// Avoid advertising the Express implementation in response headers.
app.disable("x-powered-by");

// HTTP security headers: frame restrictions, content type
// sniffing protection, and other browser security defaults.
//
// WHY: These protect against several browser-side attack
// classes, though they don't replace authentication,
// authorization, validation or HTTPS.
app.use(helmet());

// Compress sufficiently large responses.
// WHY: Large JSON responses may use less network bandwidth.
//
// TRADEOFF: Compression consumes CPU resources.
// Small responses can cost more to compress than they save.
//
// compression() also supports streamed responses, but
// compression efficiency depends on content and client headers.
app.use(
  compression({
    threshold: 1024,

    // Only compress the types we explicitly want here.
    // CSV exports and other responses stay as configured
    // unless their content type matches the filter.
    filter: (req, res) => {
      const type = res.getHeader("Content-Type");

      if (typeof type === "string" && type.toLowerCase().includes("text/csv")) {
        return false;
      }

      return compression.filter(req, res);
    },
  }),
);

// Har HTTP request ko unique ID aur structured logs do.
// WHY: Multiple concurrent requests ke errors correlate karna easy hoga.
app.use(
  pinoHttp({
    logger,

    // Server-generated UUID use kar rahe hain.
    // Client-supplied arbitrary ID ko blindly trust nahi karenge.
    genReqId: (req, res) => {
      const id = randomUUID();

      // Client same ID support/debugging ke liye share kar sakta hai.
      res.setHeader("X-Request-ID", id);

      return id;
    },

    // HTTP success/failure ke according log severity.
    customLogLevel: (req, res, error) => {
      if (error || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },

    // Passwords, Authorization headers aur cookies avoid karo.
    // WHY: Default request logging mein sensitive headers
    // accidentally capture nahi karna chahte.
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  }),
);

app.use(httpMetrics);

// JSON body parser and 100 KB size limit.
// WITHOUT LIMIT: Extremely large request bodies memory pressure
// create kar sakti hain.
app.use(
  express.json({
    limit: "100kb",

    // Express calls verify before JSON parsing.
    // WHY: HMAC signature original request bytes par based hai.
    // JSON.stringify(req.body) original spacing/key order
    // change kar sakta hai, signature verification fail hogi.
    verify: (req, res, buffer) => {
      if (req.originalUrl === "/api/v1/payments/webhooks/demo") {
        req.rawBody = Buffer.from(buffer);
      }
    },
  }),
);

// Startup/shutdown readiness state.
// WHY: Alive server aur ready server alag concepts hain.
let ready = false;

export function setReadiness(value) {
  ready = value;
}

// Liveness: HTTP application respond kar rahi hai ya nahi.
// Is endpoint mein PostgreSQL query nahi karenge.
app.get("/health/live", (req, res) => {
  return res.status(200).json({
    success: true,
    status: "alive",
  });
});

// Readiness: API required DB ke saath kaam kar sakti hai ya nahi.
app.get("/health/ready", async (req, res) => {
  // Startup incomplete ya shutdown in progress.
  if (!ready) {
    return res.status(503).json({
      success: false,
      status: "not_ready",
    });
  }

  try {
    // Current DB connectivity verify karo.
    await checkDatabase();
    await checkRedis();

    return res.status(200).json({
      success: true,
      status: "ready",
    });
  } catch (error) {
    // Database error ki internal details client ko expose nahi karni.
    req.log.warn({ err: error }, "Database readiness check failed");

    return res.status(503).json({
      success: false,
      status: "not_ready",
    });
  }
});

// Root API route.
// Future mein module routers /api/v1 ke andar mount honge.
app.get("/api/v1", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "CommerceFlow API",
    version: "v1",
  });
});

// Auth routes:
// /api/v1/auth/register, /login, /refresh, /logout, /me
app.use("/api/v1", apiRoutes);

// Unknown route par uniform application error.
// WITHOUT THIS: Default HTML 404 response API clients ke
// expected JSON format se different ho sakta hai.
app.use((req, res, next) => {
  next(new AppError("Route not found", 404, "ROUTE_NOT_FOUND"));
});

// Error handler LAST.
// WHY: Earlier middleware/route errors yahan handle honge.
app.use(errorHandler);
