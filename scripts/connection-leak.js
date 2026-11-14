import { pool } from "../src/config/database.js";

// This script intentionally leaks connections.
// Run it only in your local development environment.

const printPoolStatus = (label) => {
  console.log(`\n${label}`);

  console.table({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
};

const runExperiment = async () => {
  // For this experiment, use DB_POOL_MAX=2.
  console.log("Pool maximum connections:", pool.options.max);

  // Borrow the first connection.
  const clientA = await pool.connect();

  printPoolStatus("After borrowing connection A");

  // Borrow the second connection.
  const clientB = await pool.connect();

  printPoolStatus("After borrowing connection B");

  // IMPORTANT:
  // We intentionally do not release clientA or clientB yet.
  // Both connections are now unavailable to other queries.

  console.log("\nRunning another query...");

  // This request needs a free connection.
  // Since both connections are borrowed, it must wait.
  try {
    await pool.query("SELECT NOW()");

    console.log("Query completed");
  } catch (error) {
    // Our pool has connectionTimeoutMillis = 5000.
    // The waiting query should fail after that timeout.
    console.error("Query failed:", error.message);
  }

  printPoolStatus("After the timeout");

  // Return the connections so the pool can be closed properly.
  // Without this cleanup, our script could remain running.
  clientA.release();
  clientB.release();

  printPoolStatus("After releasing both connections");

  await pool.end();
};

runExperiment().catch((error) => {
  console.error("Experiment failed:", error);
  process.exitCode = 1;
});
