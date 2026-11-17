import { memoryUsage } from "node:process";

// Usage:
// node --expose-gc scripts/labs/04-memory.js bounded
// node --expose-gc scripts/labs/04-memory.js retained
//
// NOTE: "retained" deliberately simulates an application
// keeping references that it no longer needs.
//
// NEVER copy this retained-array design into real services.

const mode = process.argv[2] ?? "bounded";

if (!["bounded", "retained"].includes(mode)) {
  throw new Error("Use bounded or retained");
}

const retained = [];

function heapMb() {
  return Number((memoryUsage().heapUsed / 1024 / 1024).toFixed(2));
}

// We create unique content to make memory changes visible.
// Avoid extremely large allocations in learning scripts.
function makeRecords(batch) {
  return Array.from({ length: 1000 }, (_, i) => ({
    id: `${batch}-${i}`,
    text: `${batch}-${i}-${"x".repeat(1000)}`,
  }));
}

for (let batch = 1; batch <= 30; batch++) {
  const records = makeRecords(batch);

  if (mode === "retained") {
    // Problematic behavior:
    // Old records remain reachable through this array.
    //
    // WHY GC cannot reclaim them:
    // The application still holds references.
    retained.push(records);
  }

  // Force a GC opportunity ONLY for this local experiment.
  // Calling GC manually is not normal app design.
  global.gc?.();

  if (batch % 5 === 0) {
    console.log({
      mode,
      batch,
      retainedBatches: retained.length,
      heapUsedMb: heapMb(),
    });
  }
}
