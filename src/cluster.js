import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

// Find how many CPU threads are available to this process.
const availableCpus = availableParallelism();

// For learning, start with a maximum of 2 server processes.
// Later we can benchmark different worker counts.
const WORKER_COUNT = Math.min(2, availableCpus);

// Each cluster worker will run our existing server.js file.
const serverFile = fileURLToPath(new URL("./server.js", import.meta.url));

// Track whether the cluster is stopping intentionally.
let shuttingDown = false;

// The primary process creates and manages workers.
if (cluster.isPrimary) {
  console.log(`Primary process started. PID: ${process.pid}`);
  console.log(`Starting ${WORKER_COUNT} server workers`);

  // Tell Cluster which script each worker should run.
  cluster.setupPrimary({
    exec: serverFile,
  });

  // Create the server processes.
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  // This event runs when a worker process exits.
  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} exited`, { code, signal });

    // Replace a worker that exits unexpectedly.
    // Do not replace workers during intentional shutdown.
    if (!shuttingDown) {
      cluster.fork();
    }
  });

  // Stop all workers when the primary receives a shutdown signal.
  // We'll improve graceful request draining in a later topic.
  const stopCluster = () => {
    if (shuttingDown) return;

    shuttingDown = true;

    for (const worker of Object.values(cluster.workers)) {
      worker.kill("SIGTERM");
    }
  };

  process.on("SIGINT", stopCluster);
  process.on("SIGTERM", stopCluster);
}
