import { performance } from "node:perf_hooks";
import { recordHttpRequest } from "./runtime-metrics.js";

// Lightweight middleware captures time until response finishes.
//
// WHY: JSON response time, database delay and Redis calls
// together affect user-visible HTTP latency.
//
// We count only finished responses; aborted connections
// should be investigated separately through structured logs.
export function httpMetrics(req, res, next) {
  const started = performance.now();

  res.once("finish", () => {
    const duration = performance.now() - started;

    recordHttpRequest(res.statusCode, duration);
  });

  next();
}
