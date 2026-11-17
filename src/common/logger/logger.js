import pino from "pino";
import { env } from "../../config/env.js";

// Ek shared application logger create kar rahe hain.
// WHY: API, PostgreSQL, Auth, Orders aur workers ke logs
// ka format consistent rahega.
// WITHOUT SHARED LOGGER: Different files different formats
// use kar sakti hain; debugging difficult hogi.
export const logger = pino({
  // Development mein debug logs bhi allow karenge.
  // Production mein unnecessary debug noise avoid karenge.
  level: env.NODE_ENV === "production" ? "info" : "debug",

  // Known sensitive properties redact karna additional protection hai.
  // NOTE: Primary rule hai ki passwords/tokens log hi na karein.
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
