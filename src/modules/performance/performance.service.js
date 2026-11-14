import { Worker } from "node:worker_threads";

import { AppError } from "../../errors/app-error.js";
import { logger } from "../../config/logger.js";

// Maximum CPU tasks running simultaneously.
const MAX_WORKERS = 2;

// Maximum tasks waiting for a Worker.
const MAX_QUEUE_SIZE = 10;

class WorkerPool {
  constructor() {
    // Stores our reusable workers and their current jobs.
    this.workers = [];

    // Stores jobs waiting for a free worker.
    this.queue = [];

    // Create the initial workers.
    for (let i = 0; i < MAX_WORKERS; i++) {
      this.createWorker();
    }
  }

  createWorker() {
    // Start a Worker that stays alive and listens for messages.
    const worker = new Worker(
      new URL("../../workers/heavy-calculation.worker.js", import.meta.url),
    );

    // Keep track of the task assigned to this Worker.
    const slot = {
      worker,
      job: null,
    };

    this.workers.push(slot);

    // A message means the current calculation finished.
    worker.on("message", (message) => {
      const job = slot.job;

      if (!job) {
        return;
      }

      // Mark this Worker as available again.
      slot.job = null;

      if (message.success) {
        job.resolve(message.data);
      } else {
        job.reject(new Error(message.error));
      }

      // Give this Worker another job if anything is waiting.
      this.dispatch();
    });

    // Record errors that happen inside the Worker.
    worker.on("error", (error) => {
      logger.error({ err: error }, "Worker Thread error");
    });

    // Handle unexpected Worker termination.
    worker.on("exit", (code) => {
      // Remove the stopped Worker from the pool.
      this.workers = this.workers.filter((item) => item !== slot);

      // If it was working on a job, that job cannot finish.
      if (slot.job) {
        slot.job.reject(new Error(`Worker exited with code ${code}`));

        slot.job = null;
      }

      logger.warn({ code }, "Worker exited; creating replacement");

      // Restore pool capacity with a new Worker.
      this.createWorker();

      // Continue any queued jobs.
      this.dispatch();
    });
  }

  dispatch() {
    // Find a Worker that currently has no assigned job.
    const freeWorker = this.workers.find((slot) => slot.job === null);

    // Nothing to do if all Workers are busy or queue is empty.
    if (!freeWorker || this.queue.length === 0) {
      return;
    }

    // Remove the oldest waiting job (FIFO ordering).
    const job = this.queue.shift();

    // Remember which job this Worker is processing.
    freeWorker.job = job;

    // Send task data to the Worker.
    freeWorker.worker.postMessage({
      durationMs: job.durationMs,
    });

    // Other free Workers can take more queued jobs.
    this.dispatch();
  }

  run(durationMs) {
    return new Promise((resolve, reject) => {
      // Reject when every Worker is busy and the queue is full.
      const allBusy = this.workers.every((slot) => slot.job !== null);

      if (allBusy && this.queue.length >= MAX_QUEUE_SIZE) {
        reject(
          new AppError(
            "Worker queue is full. Try again later.",
            503,
            "WORKER_QUEUE_FULL",
          ),
        );
        return;
      }

      // Save the task and its Promise callbacks.
      this.queue.push({
        durationMs,
        resolve,
        reject,
      });

      // Try to assign it to an available Worker immediately.
      this.dispatch();
    });
  }

  getStats() {
    return {
      maxWorkers: MAX_WORKERS,
      activeWorkers: this.workers.filter((slot) => slot.job !== null).length,
      availableWorkers: this.workers.filter((slot) => slot.job === null).length,
      queuedJobs: this.queue.length,
      maxQueueSize: MAX_QUEUE_SIZE,
    };
  }
}

// Create the pool only when the first calculation needs it.
// This avoids starting Workers just by importing this module.
let workerPool;

const getWorkerPool = () => {
  if (!workerPool) {
    workerPool = new WorkerPool();
  }

  return workerPool;
};

// Public function used by our Express route.
export const runHeavyCalculation = (durationMs = 5000) => {
  return getWorkerPool().run(durationMs);
};

// Return current pool statistics for debugging.
export const getWorkerPoolStats = () => {
  if (!workerPool) {
    return {
      maxWorkers: MAX_WORKERS,
      activeWorkers: 0,
      availableWorkers: 0,
      queuedJobs: 0,
      maxQueueSize: MAX_QUEUE_SIZE,
      initialized: false,
    };
  }

  return {
    ...workerPool.getStats(),
    initialized: true,
  };
};
