import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "../config/env.js";

// Producers should fail in bounded time when Redis unavailable.
// WHY: HTTP or outbox dispatcher indefinitely block na ho.
export const producerRedis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

producerRedis.on("error", () => {
  // Connection errors are reported by operations that use Redis.
  // Don't log secrets from the connection URL.
});

// Worker uses a separate Redis connection.
// BullMQ requires maxRetriesPerRequest: null for its worker
// connection so it can recover from transient outages.
export const workerRedis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Background notifications (currently logged, not emailed).
export const notificationQueue = new Queue("commerce-notifications", {
  connection: producerRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: false,
  },
});

// Time-expired checkout processing.
export const expiryQueue = new Queue("commerce-expiry", {
  connection: producerRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: false,
  },
});

// Failed jobs can be copied here for inspection/manual replay.
export const deadLetterQueue = new Queue("commerce-dlq", {
  connection: producerRedis,
});

// Close only the connection resources this module owns.
export async function closeQueues() {
  await Promise.all([
    notificationQueue.close(),
    expiryQueue.close(),
    deadLetterQueue.close(),
  ]);

  await Promise.all([producerRedis.quit(), workerRedis.quit()]);
}
