import { Worker } from "bullmq";

import { pool } from "../config/database.js";
import { logger } from "../common/logger/logger.js";

import {
  notificationQueue,
  expiryQueue,
  deadLetterQueue,
  workerRedis,
  closeQueues,
} from "./queues.js";

import { findExpiredOrders, expireOrder } from "./order-expiry.js";

// -----------------------------------------------------
// TRANSACTIONAL OUTBOX DISPATCHER
// -----------------------------------------------------

async function dispatchOutbox() {
  // One DB client because lock + enqueue + published marker
  // belong to one controlled batch.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // SKIP LOCKED allows another dispatcher to take
    // different rows without waiting on already claimed rows.
    const result = await client.query(
      `SELECT id, event_type, payload
       FROM outbox_events
       WHERE published_at IS NULL
       ORDER BY created_at, id
       LIMIT 25
       FOR UPDATE SKIP LOCKED`,
    );

    for (const event of result.rows) {
      // Stable BullMQ job ID helps deduplicate repeated
      // enqueue attempts while the job remains retained.
      //
      // Delivery is still AT LEAST ONCE: the processor
      // must be safe to execute again.
      await notificationQueue.add(
        event.event_type,
        { outboxId: event.id, ...event.payload },
        { jobId: `outbox-${event.id}` },
      );

      await client.query(
        `UPDATE outbox_events
         SET published_at = NOW()
         WHERE id = $1`,
        [event.id],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// -----------------------------------------------------
// EXPIRY JOB DISCOVERY
// -----------------------------------------------------

async function scheduleExpiredOrders() {
  const ids = await findExpiredOrders();

  for (const orderId of ids) {
    // A deterministic ID avoids repeatedly queueing the
    // same due order while the job is retained.
    await expiryQueue.add(
      "expire-order",
      { orderId },
      { jobId: `expiry-${orderId}` },
    );
  }
}

// -----------------------------------------------------
// JOB WORKERS
// -----------------------------------------------------

// Notification side effect is intentionally a structured log.
// It is NOT an actual email/SMS delivery.
// Future Notification module can replace this with a provider.
const notificationWorker = new Worker(
  "commerce-notifications",
  async (job) => {
    logger.info(
      { eventType: job.name, outboxId: job.data.outboxId },
      "Notification event processed (no external delivery)",
    );
  },
  { connection: workerRedis, concurrency: 5 },
);

const expiryWorker = new Worker(
  "commerce-expiry",
  async (job) => {
    const result = await expireOrder(job.data.orderId);

    logger.info(
      { orderId: job.data.orderId, ...result },
      "Expiry job processed",
    );
  },
  { connection: workerRedis, concurrency: 5 },
);

// Move permanently failed jobs to a separate queue.
// This event handler is best-effort; we also retain failed
// jobs in BullMQ for inspection/recovery.
for (const worker of [notificationWorker, expiryWorker]) {
  worker.on("failed", async (job, error) => {
    logger.error({ err: error, jobId: job?.id }, "Background job failed");

    if (!job) return;

    // Retries may still be pending.
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

    try {
      await deadLetterQueue.add(
        "failed-job",
        {
          queueName: worker.name,
          originalJobId: job.id,
          error: error.message,
        },
        { jobId: `dlq-${worker.name}-${job.id}` },
      );
    } catch (dlqError) {
      logger.error({ err: dlqError }, "Unable to enqueue dead-letter record");
    }
  });

  worker.on("error", (error) => {
    logger.error({ err: error }, "BullMQ worker error");
  });
}

// -----------------------------------------------------
// PERIODIC WORK
// -----------------------------------------------------

// Prevent overlapping runs of the same periodic task.
let polling = false;
let stopping = false;

async function poll() {
  if (polling || stopping) return;

  polling = true;

  try {
    await dispatchOutbox();
    await scheduleExpiredOrders();
  } catch (error) {
    logger.error({ err: error }, "Background poll failed; will retry");
  } finally {
    polling = false;
  }
}

// Redis/DB outages don't lose records:
// pending outbox and expired orders remain in PostgreSQL.
const interval = setInterval(() => {
  void poll();
}, 10000);

void poll();

async function shutdown(signal) {
  if (stopping) return;

  stopping = true;
  clearInterval(interval);

  logger.info({ signal }, "Background worker stopping");

  try {
    // Wait for running poll to finish before closing resources.
    while (polling) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await notificationWorker.close();
    await expiryWorker.close();

    await closeQueues();
    await pool.end();

    logger.info("Background worker stopped");
  } catch (error) {
    logger.error({ err: error }, "Worker shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
