import { performance } from "node:perf_hooks";

// HTTP benchmark for the LOCAL CommerceFlow instance.
//
// WHY: API speed judge karne ke liye actual measurements
// chahiye, sirf console logs ya guesswork nahi.
//
// This is NOT a full production load-testing framework.
// It measures local HTTP end-to-end latency.

const BASE_URL = "http://127.0.0.1:5000";

// Keep requests bounded to avoid accidentally
// overwhelming the local PostgreSQL/Redis services.
const TOTAL_REQUESTS = 60;
const CONCURRENCY = 10;

// Existing public endpoint: no authentication required.
const path = "/api/v1/products?limit=20&offset=0";

function percentile(sorted, ratio) {
  const position = Math.ceil(sorted.length * ratio) - 1;

  return sorted[Math.max(0, position)];
}

async function main() {
  const latencies = [];
  const statuses = new Map();

  let nextIndex = 0;

  // Before benchmarking, issue one warm-up request.
  // WHY: Initial DB connection, cache fill, and runtime
  // initialization should be distinguished from steady state.
  const warmup = await fetch(`${BASE_URL}${path}`);

  if (!warmup.ok) {
    throw new Error(`Warm-up failed: ${warmup.status}`);
  }

  // Multiple workers issue requests concurrently.
  // CONCURRENCY bounds in-flight requests.
  async function worker() {
    while (nextIndex < TOTAL_REQUESTS) {
      nextIndex++;

      const started = performance.now();

      const response = await fetch(`${BASE_URL}${path}`);

      // Consume body to measure complete response transfer.
      await response.arrayBuffer();

      const elapsed = performance.now() - started;

      latencies.push(elapsed);

      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
    }
  }

  const started = performance.now();

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const totalMs = performance.now() - started;

  latencies.sort((a, b) => a - b);

  const average =
    latencies.reduce((sum, value) => sum + value, 0) / latencies.length;

  // p50 = median, p95 = 95th percentile, etc.
  // Tail latency matters for real user experience.
  console.log(
    JSON.stringify(
      {
        endpoint: path,
        requests: TOTAL_REQUESTS,
        concurrency: CONCURRENCY,
        statusCounts: Object.fromEntries(statuses),
        averageMs: Number(average.toFixed(2)),
        p50Ms: Number(percentile(latencies, 0.5).toFixed(2)),
        p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
        p99Ms: Number(percentile(latencies, 0.99).toFixed(2)),
        throughputRequestsPerSecond: Number(
          (TOTAL_REQUESTS / (totalMs / 1000)).toFixed(2),
        ),
      },
      null,
      2,
    ),
  );
}

await main();
