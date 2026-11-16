import express from "express";

const app = express();
const PORT = 5055;

// This array stays alive for the lifetime of the process.
const leakedRequests = [];

let requestNumber = 0;

// Create example data in memory.
const createData = () => {
  const records = [];

  // Each call creates 3000 different objects.
  for (let i = 0; i < 3000; i++) {
    records.push({
      id: `${requestNumber}-${i}`,
      title: `Product-${requestNumber}-${i}`,
      description: `Description-${requestNumber}-${i}-` + "X".repeat(300),
      price: i * 10,
    });
  }

  return records;
};

const toMB = (bytes) => Number((bytes / 1024 / 1024).toFixed(2));

// Intentionally BAD endpoint.
app.post("/leak", (req, res) => {
  requestNumber++;

  const data = createData();

  // BUG: We never remove these records.
  // The global array keeps every object reachable.
  leakedRequests.push(data);

  res.json({
    message: "Data stored permanently in global array",
    retainedBatches: leakedRequests.length,
  });
});

// Better endpoint: data is temporary.
app.post("/fixed", (req, res) => {
  requestNumber++;

  const data = createData();

  // We process data without retaining it globally.
  const count = data.length;

  res.json({
    message: "Temporary data processed",
    count,
  });
});

// Inspect memory after optionally requesting garbage collection.
app.get("/memory", (req, res) => {
  if (typeof global.gc === "function") {
    // Only available with --expose-gc.
    // For local experiments, not production requests.
    global.gc();
  }

  const memory = process.memoryUsage();

  res.json({
    heapUsedMB: toMB(memory.heapUsed),
    heapTotalMB: toMB(memory.heapTotal),
    rssMB: toMB(memory.rss),
    externalMB: toMB(memory.external),
    retainedBatches: leakedRequests.length,
  });
});

// Clear intentionally retained data.
app.post("/reset", (req, res) => {
  leakedRequests.length = 0;

  res.json({
    message: "Stored references cleared",
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Memory demo: http://127.0.0.1:${PORT}`);
});
