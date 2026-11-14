import { performance } from "node:perf_hooks";

import { pool } from "../../src/config/database.js";

// Total number of queries we will execute together.
const TOTAL_QUERIES = 40;

// Each query will stay busy for 200 milliseconds.
const QUERY_DELAY_SECONDS = 0.2;

// Store how long each query takes from start to finish.
const durations = [];

// Track the largest waiting queue we observe.
let maxWaitingCount = 0;
let maxTotalCount = 0;

// Run one database query and measure its total duration.
const runQuery = async (queryNumber) => {
  const start = performance.now();

  // pg_sleep simulates a slow database query.
  // pool.query borrows a connection and returns it automatically.
  await pool.query("SELECT pg_sleep($1::double precision)", [
    QUERY_DELAY_SECONDS,
  ]);

  const duration = performance.now() - start;

  durations.push(duration);

  return queryNumber;
};

// Find the p95 duration from a sorted list of measurements.
// p95 means approximately 95% of queries finished within this time.
const getP95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b);

  const index = Math.ceil(sorted.length * 0.95) - 1;

  return sorted[index];
};

const runExperiment = async () => {
  console.log("\nStarting PostgreSQL pool experiment");

  console.log({
    poolSize: pool.options.max,
    totalQueries: TOTAL_QUERIES,
    queryDelaySeconds: QUERY_DELAY_SECONDS,
  });

  // Check pool activity periodically while queries run.
  const monitor = setInterval(() => {
    maxWaitingCount = Math.max(maxWaitingCount, pool.waitingCount);

    maxTotalCount = Math.max(maxTotalCount, pool.totalCount);

    console.log({
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingRequests: pool.waitingCount,
    });
  }, 100);

  const start = performance.now();

  try {
    // Start all 40 queries without waiting for each one separately.
    // Promise.all waits until all queries finish successfully.
    await Promise.all(
      Array.from({ length: TOTAL_QUERIES }, (_, index) => runQuery(index + 1)),
    );

    const totalTime = performance.now() - start;

    console.log("\nExperiment completed");

    console.table({
      poolSize: pool.options.max,
      totalQueries: TOTAL_QUERIES,
      totalTimeMs: Math.round(totalTime),
      averageQueryMs: Math.round(
        durations.reduce((sum, ms) => sum + ms, 0) / durations.length,
      ),
      p95QueryMs: Math.round(getP95(durations)),
      maxConnections: maxTotalCount,
      maxWaitingRequests: maxWaitingCount,
    });
  } finally {
    // Stop monitoring and close database connections.
    // Otherwise the script may keep running unnecessarily.
    clearInterval(monitor);

    await pool.end();
  }
};

runExperiment().catch((error) => {
  console.error("Pool experiment failed:", error);
  process.exitCode = 1;
});
