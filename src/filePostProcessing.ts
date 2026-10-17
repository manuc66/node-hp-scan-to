import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PostCommand } from "./postCommand.js";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

/**
 * A hook that never returns must not block the scan flow forever.
 *
 * The default is generous because a legitimate conversion (a PDF/A pass over
 * a large multi-page scan) can take a while. Override it with the
 * `POST_COMMAND_TIMEOUT` environment variable (milliseconds) when a stricter
 * bound is wanted.
 */
export const FALLBACK_POST_PROCESSING_TIMEOUT_MS = 300_000;

export const DEFAULT_POST_PROCESSING_TIMEOUT_MS = resolveTimeout(
  process.env["POST_COMMAND_TIMEOUT"],
);

/**
 * Reads the timeout from the `POST_COMMAND_TIMEOUT` environment variable,
 * falling back to a generous default when it is absent or unusable.
 */
export function resolveTimeout(rawValue: string | undefined): number {
  const configured = Number(rawValue);
  if (rawValue !== undefined && rawValue.trim() !== "" && configured > 0) {
    return configured;
  }
  return FALLBACK_POST_PROCESSING_TIMEOUT_MS;
}

/** Upper bound on the stderr kept for the logs. */
const MAX_LOGGED_STDERR_LENGTH = 2000;

/**
 * Runs an optional external command over a generated scan file.
 *
 * The command is a program followed by its arguments and is spawned directly,
 * without a shell: a file name is always passed as a single argument and can
 * never be interpreted as shell syntax.
 *
 * Two placeholders are supported:
 * - `{input}` the absolute path of the generated file
 * - `{output}` an absolute temporary file path; when the command uses it, the
 *   resulting file replaces the original file after a successful run.
 *
 * When the command does not use `{output}`, it is expected to modify the file
 * in place.
 *
 * A failure never throws: the original file is kept and the error is logged,
 * so the post-processing hook stays an optional escape hatch. In the in-place
 * form the file is copied before the command runs and restored when the
 * command fails or leaves nothing, so a half-written output cannot be lost.
 */
export async function runFilePostProcessing(
  command: PostCommand | undefined,
  filePath: string,
  timeoutMs: number = DEFAULT_POST_PROCESSING_TIMEOUT_MS,
): Promise<void> {
  if (command === undefined || command.length === 0) {
    return;
  }

  const [program, ...args] = command;
  if (program.trim() === "") {
    return;
  }

  const usesOutput = command.some((argument) => argument.includes("{output}"));
  const outputPath = usesOutput
    ? buildTemporaryPath(filePath, "tmp")
    : undefined;

  const resolvedArgs = args.map((argument) =>
    argument
      .replaceAll("{input}", filePath)
      .replaceAll("{output}", outputPath ?? ""),
  );

  if (outputPath !== undefined) {
    const exitCode = await runCommand(program, resolvedArgs, timeoutMs);
    if (exitCode !== 0) {
      logger.error(
        { exitCode, command: [program, ...resolvedArgs] },
        `Post-processing command failed, keeping the original file: ${filePath}`,
      );
      await discardTempFile(outputPath);
      return;
    }
    await replaceFileWithOutput(outputPath, filePath, command);
    return;
  }

  await runInPlaceCommand(program, resolvedArgs, filePath, command, timeoutMs);
}

/**
 * Runs a command that is expected to modify the file at `filePath` in place.
 *
 * Unlike the `{output}` form, there is no atomic swap here: a tool can
 * truncate or half-write the file before failing. The original is therefore
 * copied first and put back whenever the run does not leave a usable file, so
 * a failed hook can never lose the scan.
 */
async function runInPlaceCommand(
  program: string,
  resolvedArgs: string[],
  filePath: string,
  command: PostCommand,
  timeoutMs: number,
): Promise<void> {
  const backupPath = buildTemporaryPath(filePath, "bak");

  try {
    await fs.copyFile(filePath, backupPath);
  } catch (error) {
    logger.error(
      { error, command },
      `Post-processing command could not back up ${filePath}, keeping the original file`,
    );
    return;
  }

  const exitCode = await runCommand(program, resolvedArgs, timeoutMs);
  if (exitCode !== 0) {
    logger.error(
      { exitCode, command: [program, ...resolvedArgs] },
      `Post-processing command failed, restoring the original file: ${filePath}`,
    );
    await restoreBackup(backupPath, filePath, command);
    return;
  }

  if (!(await isRegularFile(filePath))) {
    logger.error(
      { command: [program, ...resolvedArgs] },
      `Post-processing command did not leave the file at ${filePath}, restoring the original file`,
    );
    await restoreBackup(backupPath, filePath, command);
    return;
  }

  await discardTempFile(backupPath);
  logger.info(`Post-processing applied to ${filePath}`);
}

/**
 * Puts the backup back in place. When the hook left something the rename
 * cannot overwrite (a directory), it is removed first: the backup is the only
 * copy of the scan at this point, so it must win.
 */
async function restoreBackup(
  backupPath: string,
  filePath: string,
  command: PostCommand,
): Promise<void> {
  try {
    await fs.rename(backupPath, filePath);
  } catch {
    try {
      await fs.rm(filePath, { recursive: true, force: true });
      await fs.rename(backupPath, filePath);
    } catch (error) {
      logger.error(
        { error, command },
        `The original file could not be restored from its backup: ${filePath}`,
      );
      return;
    }
  }
  logger.info(`Original file restored: ${filePath}`);
}

/**
 * Builds a unique path next to the original file. A random suffix keeps
 * concurrent post-processing runs on the same file from sharing a temporary
 * file, and keeping it in the same folder keeps the later rename atomic.
 *
 * `kind` distinguishes the output file of a `{output}` command ("tmp") from
 * the safety copy of an in-place command ("bak").
 */
function buildTemporaryPath(filePath: string, kind: "tmp" | "bak"): string {
  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.postprocess.${kind}`,
  );
}

function runCommand(
  program: string,
  args: string[],
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(program, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      // A dedicated process group on POSIX lets the timeout kill the whole
      // tree: a hook that starts a converter of its own would otherwise keep
      // running (and writing to {output}) after the direct child was killed.
      detached: process.platform !== "win32",
    });

    let stderr = "";
    let settled = false;
    const settle = (exitCode: number) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(exitCode);
    };

    child.stderr?.on("data", (chunk: Buffer) => {
      // Keep the tail: the end of stderr is where tools report the failure.
      stderr = (stderr + chunk.toString()).slice(-MAX_LOGGED_STDERR_LENGTH);
    });

    // stdout is piped but its content is not wanted: it must still be
    // consumed, otherwise a hook writing past the OS pipe buffer (~64 KB)
    // blocks forever waiting for a reader and is only stopped by the
    // timeout, reporting a spurious failure for a hook that worked.
    child.stdout?.resume();

    const timer = setTimeout(() => {
      logger.error(
        { program, timeoutMs },
        "Post-processing command timed out, killing it",
      );
      killProcessTree(child);
      // Give the kill a moment to be observed before giving up on the event.
      setTimeout(() => settle(-1), 1_000).unref();
    }, timeoutMs);
    timer.unref();

    child.on("error", (error) => {
      clearTimeout(timer);
      logger.error(
        { error: error.message, program },
        "Post-processing command could not be started",
      );
      settle(-1);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        logger.debug({ program, args }, "Post-processing command succeeded");
        settle(0);
        return;
      }
      logger.error(
        { exitCode: code, signal, stderr, program },
        "Post-processing command reported a failure",
      );
      settle(code ?? -1);
    });
  });
}

/**
 * Kills the command and everything it started.
 *
 * On POSIX the child is spawned in its own process group (the `detached`
 * option), so signalling the negative pid reaches its descendants too: a hook
 * that delegates to another tool must not leave that tool running after the
 * timeout. Windows has no process group to signal, `taskkill /T` walks the
 * process tree instead.
 */
function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    } catch {
      // Fall through to the single-process kill below.
    }
  } else {
    try {
      // Negative pid: signal the whole process group at once.
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      // The group is already gone or the child never led one.
    }
  }

  try {
    child.kill("SIGKILL");
  } catch {
    // The process is already gone.
  }
}

/**
 * Replaces the original file with the command output.
 *
 * The original is only ever removed once the replacement is known to be a
 * readable regular file, so a hook leaving a directory (or nothing at all)
 * cannot destroy the scan.
 */
async function replaceFileWithOutput(
  outputPath: string,
  filePath: string,
  command: PostCommand,
): Promise<void> {
  if (!(await isRegularFile(outputPath))) {
    logger.error(
      { command },
      `Post-processing command produced no {output} file, keeping the original file: ${filePath}`,
    );
    // The hook may have left a directory or nothing at all: drop whatever
    // sits at the temporary path so nothing is left next to the scan.
    await discardTempFile(outputPath);
    return;
  }

  try {
    await fs.rename(outputPath, filePath);
  } catch (error) {
    logger.error(
      { command, error },
      `Post-processing command output could not replace the original file, keeping it: ${filePath}`,
    );
    await discardTempFile(outputPath);
    return;
  }

  logger.info(`Post-processing applied to ${filePath}`);
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Drops a temporary file the runner created. Removing it is housekeeping: the
 * filesystem can refuse it (a hook left a directory at the path on Windows, a
 * folder turned read-only), and the hook contract is that post-processing never
 * fails the scan flow. A leftover temporary file is logged, never thrown.
 */
async function discardTempFile(outputPath: string): Promise<void> {
  try {
    await fs.rm(outputPath, { force: true, recursive: true });
  } catch (error) {
    logger.warn(
      { error, outputPath },
      "Post-processing could not remove its temporary file; it is left on disk",
    );
  }
}
