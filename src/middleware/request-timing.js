import { performance } from "node:perf_hooks";

// Measure how long a request takes inside our Node.js server.
export const requestTiming = (req, res, next) => {
  const start = performance.now();

  // Response headers are about to be sent.
  res.once("finish", () => {
    const durationMs = Number((performance.now() - start).toFixed(2));

    console.log("[HTTP TIMING]", {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
};
