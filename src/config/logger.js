import pino from "pino";

import { env } from "./env.js";

// Use readable logs during development.
// In production, keep logs in JSON format so monitoring tools
// can easily read and search them.
const transport =
  env.NODE_ENV === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined;

// Create one logger that can be reused throughout the application
export const logger = pino({
  level: env.LOG_LEVEL,

  transport,

  // Add application information to every log automatically
  base: {
    service: "commerce-flow-api",
    environment: env.NODE_ENV,
  },

  // Hide sensitive information if it accidentally reaches the logger
  // Never intentionally log passwords, tokens or payment credentials
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
});
