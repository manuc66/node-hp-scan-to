/**
 * Minimal retry loop shared by the device probes. A policy must bound the
 * retries, either by attempt count or by elapsed time.
 */
export interface RetryPolicy {
  /** Delay between two attempts, in milliseconds. */
  readonly delayMs: number;
  /** Decide whether a failed attempt is worth retrying. */
  readonly shouldRetry: (error: unknown) => boolean;
  /** Called before each retry, never after the last attempt. */
  readonly onRetry?: (error: unknown, attempt: number) => void;
  /** Test seam; defaults to `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export type RetryOptions = RetryPolicy &
  (
    | { readonly maxAttempts: number; readonly timeoutMs?: number }
    | { readonly timeoutMs: number; readonly maxAttempts?: number }
  );

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Run `task`, retrying while `shouldRetry` accepts the error and the policy
 * still allows another attempt. The last error is rethrown unchanged, so
 * callers keep the original `DeviceNotReadyError`/`AxiosError`.
 */
export async function retry<T>(
  task: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const deadline =
    options.timeoutMs === undefined ? null : Date.now() + options.timeoutMs;

  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (!options.shouldRetry(error)) {
        throw error;
      }
      if (
        options.maxAttempts !== undefined &&
        attempt >= options.maxAttempts
      ) {
        throw error;
      }

      const remainingMs =
        deadline === null ? Number.POSITIVE_INFINITY : deadline - Date.now();
      if (remainingMs <= 0) {
        throw error;
      }

      options.onRetry?.(error, attempt);
      await (options.sleep ?? defaultSleep)(
        Math.min(options.delayMs, remainingMs),
      );
    }
  }
}
