import Redis from "ioredis";

import { env } from "./env.js";
import { logger } from "../common/logger/logger.js";

// One shared Redis client for API cache and rate limiting.
//
// WHY: Har HTTP request ke liye new Redis connection
// create karna unnecessary overhead aur resource usage hai.
//
// BullMQ apne producer/worker connections separately
// manage karta hai. Unhe is client se replace nahi karenge.
export const redis = new Redis(env.REDIS_URL, {
  // Failed cache operations ko indefinitely retry nahi karna.
  // WHY: Redis unavailable ho toh public Catalog APIs
  // PostgreSQL fallback use kar sakengi.
  maxRetriesPerRequest: 1,

  // Redis disconnected ho toh requests endlessly queue na hon.
  enableOfflineQueue: false,

  // Bounded Redis connection establishment.
  connectTimeout: 2000,

  // Limit each individual Redis operation's duration.
  commandTimeout: 1500,
});

// Connection lifecycle visible rakho.
redis.on("ready", () => {
  logger.info("Application Redis client ready");
});

// Client error ko handle karna zaruri hai.
redis.on("error", (error) => {
  logger.warn({ err: error }, "Application Redis connection error");
});

// Graceful shutdown.
// WHY: Open Redis sockets process ko alive rakh sakti hain.
export async function closeRedis() {
  redis.disconnect();

  logger.info("Application Redis client disconnected");
}

// A readiness check must confirm Redis can answer commands.
// WHY: Successful connection at startup does not guarantee
// Redis remains available later.
export async function checkRedis() {
  await redis.ping();
}
