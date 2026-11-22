import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

/**
 * Maximum time granted to the disposable resources after a signal. The
 * printer can take a long time to answer a request (eSCL long polls bound the
 * event stream, and cancellation requests may queue behind it), so a graceful
 * shutdown must never be able to keep the process alive indefinitely.
 */
export const SHUTDOWN_GRACE_MS = 5_000;

export interface ShutdownHandlerOptions {
  /** Grace period before forcing the exit. Defaults to SHUTDOWN_GRACE_MS. */
  graceMs?: number;
  /** Exit function, injected for tests. Defaults to `process.exit`. */
  exit?: (code: number) => void;
}

/**
 * Installs SIGINT/SIGTERM handlers that dispose the scan listener before
 * exiting.
 *
 * - The first signal starts a graceful shutdown and always ends in an exit,
 *   even when `dispose` never settles.
 * - A second signal exits immediately, so pressing Ctrl-C twice always works.
 *
 * Returns a function that removes the handlers.
 */
export function installShutdownHandler(
  dispose: () => Promise<void>,
  options: ShutdownHandlerOptions = {},
): () => void {
  const exit = options.exit ?? ((code: number): void => process.exit(code));
  const graceMs = options.graceMs ?? SHUTDOWN_GRACE_MS;
  let shuttingDown = false;

  const shutdown = (): void => {
    if (shuttingDown) {
      exit(0);
      return;
    }
    shuttingDown = true;

    const forceExit = setTimeout(() => {
      logger.warn(
        `Shutdown did not complete within ${graceMs} ms; exiting anyway.`,
      );
      exit(0);
    }, graceMs);
    // The pending request already keeps the event loop alive; the watchdog
    // must not be the reason the process stays up.
    forceExit.unref();

    void dispose()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(forceExit);
        exit(0);
      });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
}

/** Anything that can un-register itself from the printer, best effort. */
export interface DisposableListener {
  dispose?(): Promise<void>;
}

/**
 * Un-registers the scan listener (walkup destination, eSCL subscription)
 * before exiting. A listener without `dispose`, or an un-registration that
 * fails, must never prevent the shutdown.
 */
export function installListenerShutdownHandler(
  listener: DisposableListener,
  options: ShutdownHandlerOptions = {},
): () => void {
  return installShutdownHandler(async () => {
    await listener.dispose?.();
  }, options);
}
