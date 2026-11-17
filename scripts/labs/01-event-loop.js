import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { pbkdf2Sync, pbkdf2 } from "node:crypto";
import { promisify } from "node:util";

// Run examples independently:
// node scripts/labs/01-event-loop.js sync
// node scripts/labs/01-event-loop.js async
//
// WHY: Blocking calls and asynchronous operations behave
// differently when Node.js serves concurrent HTTP requests.
//
// IMPORTANT: This is a local learning experiment.
// Never execute intentionally blocking CPU loops in API routes.

const pbkdf2Async = promisify(pbkdf2);

const mode = process.argv[2] ?? "async";

if (!["sync", "async"].includes(mode)) {
  throw new Error("Use sync or async");
}

// Monitor how late event-loop timers execute.
// This is a useful indicator of event-loop blocking.
const histogram = monitorEventLoopDelay({
  resolution: 10,
});

histogram.enable();

const started = performance.now();

// Timer should fire approximately after 50 ms.
// If main JS thread is blocked, it executes much later.
const timer = setTimeout(() => {
  console.log({
    timerDelayMs: Math.round(performance.now() - started),
  });
}, 50);

if (mode === "sync") {
  // Synchronous CPU-intensive function runs on main thread.
  //
  // CONSEQUENCE:
  // While it executes, Express callbacks, timers and other
  // JavaScript work cannot progress on that event loop.
  pbkdf2Sync("demo", "salt", 600_000, 32, "sha256");
} else {
  // Async crypto function uses Node's libuv thread pool.
  //
  // Main JS event loop can continue handling other callbacks.
  // NOTE: Async does NOT mean work costs zero CPU.
  // Too many crypto jobs can saturate the worker pool.
  await pbkdf2Async("demo", "salt", 600_000, 32, "sha256");
}

// Give the timer opportunity to run.
await new Promise((resolve) => setTimeout(resolve, 100));

clearTimeout(timer);

console.log({
  mode,
  totalDurationMs: Math.round(performance.now() - started),
  eventLoopDelayMaxMs: Number((histogram.max / 1e6).toFixed(2)),
});

histogram.disable();
