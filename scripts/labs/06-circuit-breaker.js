import { CircuitBreaker } from "../../src/common/resilience/circuit-breaker.js";

const breaker = new CircuitBreaker({
  failureThreshold: 3,
  resetAfterMs: 2000,
});

let attempts = 0;

async function fakeShippingProvider() {
  attempts++;

  // Simulate first three calls failing.
  // No real external service contacted.
  if (attempts <= 3) {
    throw new Error("Simulated shipping provider failure");
  }

  return {
    provider: "demo-shipping",
    available: true,
  };
}

// First five calls: observe CLOSED -> OPEN behavior.
for (let i = 1; i <= 5; i++) {
  try {
    const result = await breaker.execute(fakeShippingProvider);

    console.log({
      call: i,
      result,
      state: breaker.state,
    });
  } catch (error) {
    console.log({
      call: i,
      error: error.name,
      state: breaker.state,
    });
  }
}

// Wait for cooldown before recovery probe.
await new Promise((resolve) => setTimeout(resolve, 2100));

console.log({
  recovery: await breaker.execute(fakeShippingProvider),
  state: breaker.state,
});
