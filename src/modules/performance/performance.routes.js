import { Router } from "express";
import { performance } from "node:perf_hooks";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import {
  runHeavyCalculation,
  getWorkerPoolStats,
} from "./performance.service.js";
import { getMemoryStats, logMemory } from "../../utils/memory-monitor.js";
import {
  runLeakyReport,
  runSafeReport,
  clearLeakedReports,
  getLeakStats,
} from "./memory-leak-demo.js";
import { runReportProcess } from "./child-process.service.js";
import {
  getCachedProduct,
  getCacheStampedeStats,
  resetCacheStampedeStats,
} from "./product-cache.service.js";
import { redisRateLimit } from "../../middleware/redis-rate-limit.js";
import {
  getOrdersWithNPlusOne,
  getOrdersWithJoin,
  getProductsInBatch,
} from "./query-optimization-demo.service.js";

const router = Router();

// Our generated dummy product report.
const REPORT_FILE = new URL(
  "../../../data/products-report.csv",
  import.meta.url,
);

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

// Experiment A: Load the complete file into memory.
router.get("/download-buffer", async (req, res) => {
  // Take a memory snapshot before reading the file.
  logMemory("Buffer download: BEFORE");

  const start = performance.now();

  // readFile waits asynchronously, but creates a Buffer
  // containing the entire file.
  const file = await readFile(REPORT_FILE);

  // This is the actual number of bytes in the file Buffer.
  const fileSizeMB = Number((file.byteLength / 1024 / 1024).toFixed(2));

  // Measure memory while the file Buffer is still referenced.
  logMemory("Buffer download: AFTER READ");

  console.log("[BUFFER DOWNLOAD]", {
    fileSizeMB,
    readDurationMs: Math.round(performance.now() - start),
  });

  // Send the complete file to the client.
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="products-buffer.csv"',
  );

  res.send(file);
});

// Experiment B: Read and send the CSV in small chunks.
router.get("/download-stream", async (req, res) => {
  // Check the file before beginning the HTTP response.
  // This lets our normal error handler respond if it's missing.
  const fileInfo = await stat(REPORT_FILE);

  const start = performance.now();

  logMemory("Stream download: BEFORE");

  // Read chunks from disk.
  const source = createReadStream(REPORT_FILE);

  // Sample process memory during the download.
  // A timer is only an approximation of peak memory.
  let peakRssMB = getMemoryStats().rssMB;

  const monitor = setInterval(() => {
    const current = getMemoryStats();

    peakRssMB = Math.max(peakRssMB, current.rssMB);
  }, 20);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="products-stream.csv"',
  );
  res.setHeader("Content-Length", fileInfo.size);

  try {
    // Send file chunks directly into the HTTP response.
    // pipeline also handles backpressure automatically.
    await pipeline(source, res);
  } catch (error) {
    // After streaming has started, a JSON error response
    // may no longer be possible.
    req.log.error({ err: error }, "CSV download failed");

    if (!res.headersSent) {
      throw error;
    }

    // If the connection is still open, close it.
    // This prevents a client from receiving a fake successful file.
    if (!res.destroyed) {
      res.destroy(error);
    }
  } finally {
    // Always stop the memory sampling timer.
    clearInterval(monitor);

    logMemory("Stream download: AFTER");

    console.log("[STREAM DOWNLOAD]", {
      fileSizeMB: Number((fileInfo.size / 1024 / 1024).toFixed(2)),
      sampledPeakRssMB: peakRssMB,
      durationMs: Math.round(performance.now() - start),
    });
  }
});

// Generate a compressed CSV archive while downloading.
router.get("/download-gzip", async (req, res) => {
  // Validate that the source file is available first.
  const fileInfo = await stat(REPORT_FILE);

  const start = performance.now();

  // Step 1: Read the original CSV in chunks.
  const source = createReadStream(REPORT_FILE);

  // Step 2: Compress those chunks using gzip.
  const gzip = createGzip({
    level: 6,
  });

  // A downloadable .gz file, not automatic HTTP gzip encoding.
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="products-report.csv.gz"',
  );

  try {
    // CSV -> Gzip Transform -> HTTP response
    await pipeline(source, gzip, res);

    console.log("[GZIP DOWNLOAD]", {
      originalSizeMB: Number((fileInfo.size / 1024 / 1024).toFixed(2)),
      durationMs: Math.round(performance.now() - start),
    });
  } catch (error) {
    console.error("Gzip download failed:", error);

    if (!res.headersSent) {
      throw error;
    }
  }
});

// See current process memory and retained report count.
router.get("/memory/stats", (req, res) => {
  res.json({
    success: true,
    data: {
      ...getMemoryStats(),
      ...getLeakStats(),
    },
  });
});

// Intentionally create unnecessary retained objects.
router.post("/memory/leak", (req, res) => {
  const result = runLeakyReport();

  if (!result.accepted) {
    return res.status(429).json({
      success: false,
      message: "Demo memory limit reached. Clear reports first.",
      data: getLeakStats(),
    });
  }

  res.json({
    success: true,
    message: "Report retained intentionally",
    data: result,
  });
});

// Do similar work without retaining the entire report.
router.post("/memory/safe", (req, res) => {
  const result = runSafeReport();

  res.json({
    success: true,
    message: "Report processed without unnecessary retention",
    data: result,
  });
});

// Remove references to intentionally leaked reports.
router.delete("/memory/clear", (req, res) => {
  const result = clearLeakedReports();

  res.json({
    success: true,
    message: "Retained report references cleared",
    data: result,
  });
});

// Simulate a slow asynchronous operation.
// Unlike a CPU-heavy while loop, this does not block the Event Loop.
router.get("/slow-request", async (req, res) => {
  console.log("Slow request started");

  // Simulate asynchronous work taking 10 seconds.
  await new Promise((resolve) => {
    setTimeout(resolve, 10_000);
  });

  console.log("Slow request completed");

  res.json({
    success: true,
    message: "Slow request completed successfully",
    processId: process.pid,
  });
});

// Development-only demonstration of a child process.
router.get("/child-process/report", async (req, res) => {
  const result = await runReportProcess();

  res.json({
    success: true,
    message: "Report process finished",
    data: result,
  });
});

// Compare Redis cache vs PostgreSQL reads.
// This route is enabled only in development.
router.get("/cache/product/:id", async (req, res) => {
  const { id } = req.params;

  // Basic UUID format validation prevents invalid DB input.
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID",
    });
  }

  const result = await getCachedProduct(id);

  if (!result.product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  res.json({
    success: true,
    data: result.product,

    // Temporary experiment metadata.
    cache: {
      source: result.source,
      durationMs: result.durationMs,
    },
  });
});

// Inspect how many actual PostgreSQL SELECT calls occurred.
router.get("/cache/stats", (req, res) => {
  res.json({
    success: true,
    data: getCacheStampedeStats(),
  });
});

// Reset the local SQL read counter for a new experiment.
router.post("/cache/stats/reset", (req, res) => {
  resetCacheStampedeStats();

  res.json({
    success: true,
    message: "Cache experiment counter reset",
  });
});

// Only this demo endpoint uses our rate limiter for now.
// Other performance, product and order routes remain unchanged.
router.get("/rate-limit/demo", redisRateLimit, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Request allowed by Redis rate limiter",
    processId: process.pid,
    timestamp: new Date().toISOString(),
  });
});

// Validate the limit for our local performance experiments.
const getOrderLimit = (value) => {
  const limit = Number(value ?? 10);

  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return null;
  }

  return limit;
};

// Intentionally inefficient endpoint.
router.get("/n-plus-one/orders", async (req, res) => {
  const limit = getOrderLimit(req.query.limit);

  if (limit === null) {
    return res.status(400).json({
      success: false,
      message: "Limit must be an integer from 1 to 20",
    });
  }

  const result = await getOrdersWithNPlusOne(limit);

  res.json({
    success: true,
    ...result,
  });
});

// Optimized endpoint using JOIN.
router.get("/join/orders", async (req, res) => {
  const limit = getOrderLimit(req.query.limit);

  if (limit === null) {
    return res.status(400).json({
      success: false,
      message: "Limit must be an integer from 1 to 20",
    });
  }

  const result = await getOrdersWithJoin(limit);

  res.json({
    success: true,
    ...result,
  });
});

// Development-only endpoint for experimenting with batching.
router.post("/batch/products", async (req, res) => {
  const { productIds } = req.body ?? {};

  // Keep batch sizes small in this experiment.
  if (
    !Array.isArray(productIds) ||
    productIds.length < 1 ||
    productIds.length > 20
  ) {
    return res.status(400).json({
      success: false,
      message: "productIds must contain 1 to 20 IDs",
    });
  }

  // Validate all IDs before PostgreSQL receives them.
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    !productIds.every((id) => typeof id === "string" && uuidPattern.test(id))
  ) {
    return res.status(400).json({
      success: false,
      message: "Every product ID must be a valid UUID",
    });
  }

  const result = await getProductsInBatch(productIds);

  res.json({
    success: true,
    ...result,
  });
});

export default router;
