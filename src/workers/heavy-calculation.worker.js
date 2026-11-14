import { parentPort } from "node:worker_threads";
import { performance } from "node:perf_hooks";

// Perform CPU-heavy work for the requested duration.
const heavyCalculation = (durationMs) => {
  const start = performance.now();
  let result = 0;

  // This blocks only this Worker Thread.
  while (performance.now() - start < durationMs) {
    result += Math.sqrt(Math.random());
  }

  return {
    result,
    calculationMs: Math.round(performance.now() - start),
  };
};

// Listen for tasks sent by the main thread.
parentPort.on("message", (task) => {
  try {
    const result = heavyCalculation(task.durationMs);

    // Send the result back to the main thread.
    // The Worker stays alive for the next task.
    parentPort.postMessage({
      success: true,
      data: result,
    });
  } catch (error) {
    // Return a failure without permanently stopping the Worker.
    parentPort.postMessage({
      success: false,
      error: error.message,
    });
  }
});
