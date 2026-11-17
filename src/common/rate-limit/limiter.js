import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { redis } from "../../config/redis.js";

// Factory creates a separate RedisStore per limiter.
//
// WHY: Different endpoint groups need separate counters.
// Auth and public product browsing should not share one quota.
function createLimiter({ prefix, limit, windowMs }) {
  return rateLimit({
    windowMs,
    limit,

    standardHeaders: "draft-7",
    legacyHeaders: false,

    // Security decision: Redis store failure must NOT
    // silently turn a protected endpoint into unlimited access.
    passOnStoreError: false,

    store: new RedisStore({
      prefix,

      // ioredis.call(command, ...args) is the adapter
      // expected by rate-limit-redis.
      sendCommand: (command, ...args) => redis.call(command, ...args),
    }),

    message: {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
      },
    },
  });
}

// Sensitive authentication endpoints: stricter limits.
//
// NOTE: IP-based limits can affect people sharing an IP.
// Later login/account-specific controls and abuse detection
// can complement IP limits.
export const authLimiter = createLimiter({
  prefix: "commerce:rl:auth:",
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

// Public Catalog reads have a more permissive limit.
export const catalogReadLimiter = createLimiter({
  prefix: "commerce:rl:catalog:",
  windowMs: 60 * 1000,
  limit: 300,
});
