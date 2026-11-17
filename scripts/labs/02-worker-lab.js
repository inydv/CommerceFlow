import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";

// A Worker has startup overhead and separate memory.
//
// WHY: Creating unlimited Workers on every API request
// can exhaust CPU/RAM.
//
// Production pattern: bounded Worker pool or job queue.
// Here we demonstrate one bounded independent computation.

const limit = Number(process.argv[2] ?? 300_000);

if (!Number.isSafeInteger(limit) || limit < 2 || limit > 2_000_000) {
  throw new Error("Limit must be between 2 and 2,000,000");
}

function runWorker(value) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./02-cpu-worker.js", import.meta.url), {
      workerData: { limit: value },

      // Restricts V8 heap for this Worker.
      // Not a total process-memory sandbox.
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
      },
    });

    let settled = false;

    // Deadline stops unexpectedly long computations.
    const timer = setTimeout(() => {
      void worker.terminate();

      finish(new Error("Worker deadline exceeded"));
    }, 10_000);

    function finish(error, value) {
      if (settled) return;
      settled = true;

      clearTimeout(timer);

      if (error) reject(error);
      else resolve(value);
    }

    worker.once("message", (message) => {
      finish(null, message);
    });

    worker.once("error", (error) => {
      finish(error);
    });

    worker.once("exit", (code) => {
      if (code !== 0) {
        finish(new Error(`Worker exited with code ${code}`));
      } else {
        finish(new Error("Worker exited without result"));
      }
    });
  });
}

const started = performance.now();

const result = await runWorker(limit);

console.log({
  ...result,
  durationMs: Math.round(performance.now() - started),
});
