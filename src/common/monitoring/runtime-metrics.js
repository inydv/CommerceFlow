import { monitorEventLoopDelay, performance } from "node:perf_hooks";

import { memoryUsage, uptime, cpuUsage } from "node:process";

// Event-loop delay histogram, in nanoseconds.
// WHY: An API can have low CPU usage yet experience
// pauses from blocking operations or GC.
const eventLoop = monitorEventLoopDelay({
  resolution: 20,
});

eventLoop.enable();

// In-process HTTP counters.
//
// LIMITATION:
// Counters reset on restart and are per Node.js process.
// Cluster mode requires aggregation across workers.
const http = {
  total: 0,
  errors5xx: 0,
  durationsMs: [],
};

const MAX_SAMPLES = 1000;

// Response-time sample is kept bounded.
// WITHOUT LIMIT: Unbounded arrays gradually increase memory.
export function recordHttpRequest(statusCode, durationMs) {
  http.total++;

  if (statusCode >= 500) {
    http.errors5xx++;
  }

  http.durationsMs.push(durationMs);

  if (http.durationsMs.length > MAX_SAMPLES) {
    http.durationsMs.shift();
  }
}

function percentile(values, fraction) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * fraction) - 1;

  return sorted[Math.max(0, index)];
}

function mb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function milliseconds(nanoseconds) {
  if (!Number.isFinite(nanoseconds)) return 0;

  return Number((nanoseconds / 1e6).toFixed(2));
}

// Keep one CPU and event-loop utilization baseline.
let previousCpu = cpuUsage();
let previousTime = performance.now();
let previousUtilization = performance.eventLoopUtilization();

// Read/reset only when metrics endpoint is called.
// NOTE: Event-loop measurements are process-level,
// not specific to one HTTP request.
export function getRuntimeMetrics() {
  const now = performance.now();

  const cpuDelta = cpuUsage(previousCpu);
  const elapsedMs = Math.max(1, now - previousTime);

  const utilization = performance.eventLoopUtilization(previousUtilization);

  previousCpu = cpuUsage();
  previousTime = now;
  previousUtilization = performance.eventLoopUtilization();

  const memory = memoryUsage();

  const metrics = {
    processId: process.pid,

    uptimeSeconds: Math.round(uptime()),

    memory: {
      rssMb: mb(memory.rss),
      heapUsedMb: mb(memory.heapUsed),
      heapTotalMb: mb(memory.heapTotal),
      externalMb: mb(memory.external),
    },

    cpu: {
      // May exceed 100 when CPU usage spans multiple cores.
      processPercent: Number(
        (((cpuDelta.user + cpuDelta.system) / 1000 / elapsedMs) * 100).toFixed(
          2,
        ),
      ),
    },

    eventLoop: {
      utilization: Number(utilization.utilization.toFixed(4)),
      p95DelayMs: milliseconds(eventLoop.percentile(95)),
      maxDelayMs: milliseconds(eventLoop.max),
    },

    http: {
      total: http.total,
      errors5xx: http.errors5xx,
      recentSamples: http.durationsMs.length,
      p50Ms: Number(percentile(http.durationsMs, 0.5).toFixed(2)),
      p95Ms: Number(percentile(http.durationsMs, 0.95).toFixed(2)),
    },
  };

  // Reset histogram so next read describes a fresh interval.
  eventLoop.reset();

  return metrics;
}
