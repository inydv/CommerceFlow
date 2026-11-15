import { createHash } from "node:crypto";

import { getRedisClient } from "../config/redis.js";

// Learning limit: 5 requests in a 30-second window.
const MAX_REQUESTS = 5;
const WINDOW_SECONDS = 30;

// Execute the counter update atomically inside Redis.
// KEYS[1] = client rate-limit key
// ARGV[1] = maximum requests
// ARGV[2] = window duration in seconds
const RATE_LIMIT_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  local limit = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])

  -- If the limit is reached, don't increment further.
  if current >= limit then
    local ttl = redis.call('TTL', KEYS[1])
    return {0, 0, ttl}
  end

  -- Count this allowed request.
  current = redis.call('INCR', KEYS[1])

  -- Start the expiry only when the first request arrives.
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], window)
  end

  local ttl = redis.call('TTL', KEYS[1])
  return {1, limit - current, ttl}
`;

// Express middleware: runs before the protected route.
export const redisRateLimit = async (req, res, next) => {
  // Express resolves the client IP based on its trust-proxy setup.
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";

  // Hash the IP so the Redis key doesn't expose it directly.
  const clientHash = createHash("sha256").update(clientIp).digest("hex");

  const key = `commerceflow:ratelimit:demo:${clientHash}`;

  try {
    const redis = await getRedisClient();

    // Atomic: check limit, increment and set expiry together.
    const result = await redis.eval(RATE_LIMIT_SCRIPT, {
      keys: [key],
      arguments: [String(MAX_REQUESTS), String(WINDOW_SECONDS)],
    });

    const [allowed, remaining, ttl] = result.map(Number);

    // Tell Postman how much quota is available.
    res.setHeader("RateLimit-Limit", MAX_REQUESTS);
    res.setHeader("RateLimit-Remaining", remaining);

    if (allowed === 0) {
      // TTL is the remaining time until the counter expires.
      const retryAfter = Math.max(1, ttl);

      res.setHeader("Retry-After", retryAfter);

      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
        retryAfterSeconds: retryAfter,
      });
    }

    // Request is allowed. Continue to the next route handler.
    next();
  } catch (error) {
    console.error("Rate limiting failed:", error.message);

    // Fail closed for this protected demo endpoint.
    // Don't silently bypass the limit if Redis is down.
    return res.status(503).json({
      success: false,
      code: "RATE_LIMIT_UNAVAILABLE",
      message: "Request protection is temporarily unavailable.",
    });
  }
};
