import { describe, it } from "mocha";
import { expect } from "chai";
import { retry } from "../src/retry.js";

class RetryableError extends Error {}
class FatalError extends Error {}

function failing(times: number, error: Error = new RetryableError("retry")) {
  let calls = 0;
  return async () => {
    calls++;
    if (calls <= times) {
      throw error;
    }
    return calls;
  };
}

describe("retry", () => {
  it("returns the first successful result", async () => {
    let calls = 0;

    const result = await retry(
      async () => {
        calls++;
        return "ok";
      },
      {
        maxAttempts: 3,
        delayMs: 1,
        shouldRetry: () => true,
        sleep: () => Promise.resolve(),
      },
    );

    expect(result).to.equal("ok");
    expect(calls).to.equal(1);
  });

  it("retries a retryable error and reports the attempt", async () => {
    const task = failing(2);
    const attempts: number[] = [];

    const result = await retry(task, {
      maxAttempts: 5,
      delayMs: 1,
      shouldRetry: (error) => error instanceof RetryableError,
      onRetry: (_error, attempt) => attempts.push(attempt),
      sleep: () => Promise.resolve(),
    });

    expect(result).to.equal(3);
    expect(attempts).to.deep.equal([1, 2]);
  });

  it("rethrows a non-retryable error immediately", async () => {
    let calls = 0;

    let caught: unknown;
    try {
      await retry(
        async () => {
          calls++;
          throw new FatalError("fatal");
        },
        {
          maxAttempts: 5,
          delayMs: 1,
          shouldRetry: (error) => error instanceof RetryableError,
          sleep: () => Promise.resolve(),
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(FatalError);
    expect(calls).to.equal(1);
  });

  it("gives up after maxAttempts and rethrows the last error", async () => {
    let calls = 0;

    let caught: unknown;
    try {
      await retry(
        async () => {
          calls++;
          throw new RetryableError(`attempt ${calls}`);
        },
        {
          maxAttempts: 3,
          delayMs: 1,
          shouldRetry: () => true,
          sleep: () => Promise.resolve(),
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(calls).to.equal(3);
    expect((caught as Error).message).to.equal("attempt 3");
  });

  it("stops at the timeout and never sleeps past it", async () => {
    const slept: number[] = [];
    let calls = 0;

    let caught: unknown;
    try {
      await retry(
        async () => {
          calls++;
          throw new RetryableError("not ready");
        },
        {
          timeoutMs: 40,
          delayMs: 1000,
          shouldRetry: () => true,
          sleep: async (ms) => {
            slept.push(ms);
            await new Promise((resolve) =>
              setTimeout(resolve, Math.min(ms, 5)),
            );
          },
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(RetryableError);
    expect(calls).to.be.greaterThan(1);
    expect(slept.every((ms) => ms <= 40)).to.be.true;
  });
});
