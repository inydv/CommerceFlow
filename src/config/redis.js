import { createClient } from "redis";

import { env } from "./env.js";

// Create a Redis client for this Node.js process.
export const redisClient = createClient({
  url: env.REDIS_URL,

  socket: {
    connectTimeout: 2000,

    // For our local experiment, don't reconnect forever.
    // We will add a proper reconnect strategy later.
    reconnectStrategy: false,
  },

  // Don't allow unlimited pending Redis commands.
  disableOfflineQueue: true,
});

// Always handle Redis connection errors.
redisClient.on("error", (error) => {
  console.error("Redis error:", error.message);
});

// Share an in-progress connection attempt.
let connectionPromise = null;

export const getRedisClient = async () => {
  // Reuse the existing connection.
  if (redisClient.isReady) {
    return redisClient;
  }

  // Don't launch multiple connection attempts simultaneously.
  if (!connectionPromise) {
    connectionPromise = redisClient.connect().finally(() => {
      connectionPromise = null;
    });
  }

  await connectionPromise;

  return redisClient;
};
