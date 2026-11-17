import { parentPort, workerData } from "node:worker_threads";

// This code runs in a Worker Thread, NOT in the main thread.
//
// WHY: Heavy JavaScript computation can otherwise delay
// event-loop callbacks and HTTP request processing.

// Deliberately computational task for learning.
// Use a bounded count supplied by the parent.
function calculatePrimes(limit) {
  let count = 0;

  for (let number = 2; number <= limit; number++) {
    let prime = true;

    for (let divisor = 2; divisor * divisor <= number; divisor++) {
      if (number % divisor === 0) {
        prime = false;
        break;
      }
    }

    if (prime) count++;
  }

  return count;
}

const result = calculatePrimes(workerData.limit);

// Send only compact result back.
// WHY: Transferring huge objects between threads has costs.
parentPort.postMessage({
  limit: workerData.limit,
  primeCount: result,
});
