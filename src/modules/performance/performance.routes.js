import { Router } from "express";
import { performance } from "node:perf_hooks";
import {
  runHeavyCalculation,
  getWorkerPoolStats,
} from "./performance.service.js";

const router = Router();

// This function intentionally keeps the CPU busy.
// It is used only to understand Event Loop blocking.
const heavyCalculation = () => {
  const start = performance.now();

  let result = 0;

  // Run a calculation for approximately 5 seconds.
  // This loop never pauses to allow other callbacks to run.
  while (performance.now() - start < 5000) {
    result += Math.sqrt(Math.random());
  }

  return result;
};

// This endpoint runs heavy calculation on the main thread.
router.get("/blocking", (req, res) => {
  const start = performance.now();

  const result = heavyCalculation();

  res.status(200).json({
    success: true,
    message: "Blocking calculation completed",
    data: {
      result,
      durationMs: Math.round(performance.now() - start),
    },
  });
});

// This endpoint runs CPU-heavy calculation in a Worker Thread.
router.get("/worker", async (req, res) => {
  const start = performance.now();

  // The worker performs the calculation separately.
  // While waiting, the main Event Loop can handle other requests.
  const result = await runHeavyCalculation(5000);

  res.status(200).json({
    success: true,
    message: "Worker calculation completed",
    data: {
      ...result,

      // Includes worker startup and message overhead.
      totalDurationMs: Math.round(performance.now() - start),
    },
  });
});

// Development-only endpoint to inspect Worker Pool activity.
router.get("/pool-stats", (req, res) => {
  res.json({
    success: true,
    data: getWorkerPoolStats(),
  });
});

// Show which Node.js process handled this HTTP request.
// Useful for understanding Cluster Module.
router.get("/process-info", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      // Every operating-system process has a unique PID.
      processId: process.pid,

      // This process runs on the current machine.
      uptimeSeconds: Math.round(process.uptime()),

      // Memory usage belongs to this Node.js process.
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

export default router;
