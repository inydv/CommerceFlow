// Minimal circuit breaker for dependency calls.
//
// States:
// CLOSED    -> Calls allowed; observe failures.
// OPEN      -> Calls rejected quickly.
// HALF_OPEN -> One probe call tests recovery.
//
// IMPORTANT:
// This is a local design teaching implementation.
// Multi-process systems need coordinated state if they want
// one shared breaker decision across instances.
//
// Also: a timeout alone DOES NOT cancel external work
// unless the underlying operation supports AbortSignal.

export class CircuitOpenError extends Error {
  constructor() {
    super("Dependency circuit is open");
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  constructor({ failureThreshold = 3, resetAfterMs = 5000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetAfterMs = resetAfterMs;

    this.state = "CLOSED";
    this.failures = 0;

    this.openedAt = 0;
    this.probeInProgress = false;
  }

  async execute(operation) {
    if (this.state === "OPEN") {
      // After cooldown, permit a controlled recovery probe.
      if (Date.now() - this.openedAt < this.resetAfterMs) {
        throw new CircuitOpenError();
      }

      this.state = "HALF_OPEN";
    }

    if (this.state === "HALF_OPEN") {
      // Permit only one probe at a time.
      if (this.probeInProgress) {
        throw new CircuitOpenError();
      }

      this.probeInProgress = true;
    }

    try {
      // operation should enforce its own timeout and AbortSignal.
      const value = await operation();

      // A successful call closes the breaker.
      this.failures = 0;
      this.state = "CLOSED";

      return value;
    } catch (error) {
      this.failures++;

      if (
        this.state === "HALF_OPEN" ||
        this.failures >= this.failureThreshold
      ) {
        this.state = "OPEN";
        this.openedAt = Date.now();
      }

      throw error;
    } finally {
      this.probeInProgress = false;
    }
  }
}
