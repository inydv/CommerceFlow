import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

// This is an ISOLATED cluster demonstration.
//
// WHY: A single Node.js process normally executes
// main-thread JavaScript on one CPU core.
//
// Cluster forks multiple separate Node.js processes.
// Each process owns its event loop, memory, Redis client
// and PostgreSQL connection pool.
//
// IMPORTANT:
// Running 4 processes with pool.max=10 means up to
// 40 PostgreSQL connections from those API processes.
// Do NOT multiply worker counts without DB capacity planning.

const workerCount = Math.min(availableParallelism(), 2);

if (cluster.isPrimary) {
  let stopping = false;

  // Workers execute the existing actual HTTP server.
  cluster.setupPrimary({
    exec: fileURLToPath(new URL("../../src/server.js", import.meta.url)),
  });

  console.log({
    primaryPid: process.pid,
    workers: workerCount,
  });

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log({
      exitedWorker: worker.process.pid,
      code,
      signal,
    });

    // Unexpected failure: start replacement worker.
    // Production supervisors also need crash-loop backoff
    // and restart budgets to avoid endless crash storms.
    if (!stopping) {
      cluster.fork();
    }
  });

  function shutdown(signal) {
    if (stopping) return;
    stopping = true;

    console.log(`Cluster shutting down: ${signal}`);

    const workers = Object.values(cluster.workers);

    // Each worker already handles SIGTERM gracefully
    // in the existing src/server.js.
    for (const worker of workers) {
      if (worker?.isConnected()) {
        worker.process.kill("SIGTERM");
      }
    }

    // Parent process exits after workers are gone.
    cluster.disconnect(() => {
      process.exitCode = 0;
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
