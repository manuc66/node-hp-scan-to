import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import isDocker from "is-docker";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

/** One program and its arguments, spawned without a shell. */
export interface RevealCommand {
  program: string;
  args: string[];
}

// A scan loop (listen, adf-autoscan) must not pull a window to the front for
// every job: a folder revealed less than this long ago is not revealed again.
export const REVEAL_DEBOUNCE_MS = 10_000;
// The D-Bus call is awaited so a failure can fall back to xdg-open, but the
// scan flow must not wait on a file manager for longer than this.
export const DBUS_TIMEOUT_MS = 2_000;

/**
 * What the reveal depends on, so tests can replace the spawn and the
 * platform without starting a real file manager.
 */
export const revealRuntime = {
  spawn: spawn as (
    program: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcess,
  platform: process.platform,
  env: process.env as Record<string, string | undefined>,
  inDocker: (): boolean => isDocker(),
  now: (): number => Date.now(),
  dbusTimeoutMs: DBUS_TIMEOUT_MS,
  lastRevealAt: new Map<string, number>(),
};

/**
 * The commands that open the file manager on `filePath`, in the order to try
 * them. macOS and Windows select the file in one call. Elsewhere the
 * freedesktop `FileManager1.ShowItems` D-Bus call selects it (Nautilus,
 * Dolphin, Nemo and others implement it), and `xdg-open` on the containing
 * folder is the fallback for a file manager without that interface.
 */
export function buildRevealPlan(
  filePath: string,
  platform: NodeJS.Platform,
): [RevealCommand, RevealCommand?] {
  if (platform === "darwin") {
    return [{ program: "open", args: ["-R", filePath] }];
  }
  if (platform === "win32") {
    // Two arguments: Node quotes an argument holding a space as a whole, and
    // explorer.exe is reported to ignore a quoted `/select,C:\a b\scan.pdf`.
    // An absolute path, since a relative `-d` reaches here unresolved.
    return [
      {
        program: "explorer.exe",
        args: ["/select,", path.win32.resolve(filePath)],
      },
    ];
  }
  return [
    {
      program: "dbus-send",
      args: [
        "--session",
        "--print-reply",
        "--dest=org.freedesktop.FileManager1",
        "/org/freedesktop/FileManager1",
        "org.freedesktop.FileManager1.ShowItems",
        // dbus-send splits an array on commas, which a file URI keeps as is.
        `array:string:${pathToFileURL(filePath).href.replaceAll(",", "%2C")}`,
        "string:",
      ],
    },
    { program: "xdg-open", args: [path.dirname(filePath)] },
  ];
}

/**
 * Whether a file manager can be shown at all: never from a container, and on
 * Linux and the other X11/Wayland systems only inside a graphical session.
 */
export function isDesktopSession(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  inDocker: boolean,
): boolean {
  if (inDocker) {
    return false;
  }
  if (platform === "darwin" || platform === "win32") {
    return true;
  }
  return Boolean(env["DISPLAY"]) || Boolean(env["WAYLAND_DISPLAY"]);
}

function startDetached(command: RevealCommand): void {
  let child: ChildProcess;
  try {
    // NOSONAR: spawned as an argv array with the shell disabled, so the scan
    // path is never parsed as shell syntax; the program is a fixed name.
    child = revealRuntime.spawn(command.program, command.args, {
      shell: false,
      stdio: "ignore",
      detached: true,
    });
  } catch (error) {
    logger.warn(
      `Could not reveal the scan with ${command.program}: ${String(error)}`,
    );
    return;
  }
  // explorer.exe exits with 1 even when it opened the window, so the exit
  // code says nothing: only a failure to start is worth a line.
  child.on("error", (error) => {
    logger.warn(
      `Could not reveal the scan with ${command.program}: ${error.message}`,
    );
  });
  child.unref();
}

function runWithTimeout(
  command: RevealCommand,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      // NOSONAR: spawned as an argv array with the shell disabled, so the
      // scan path is never parsed as shell syntax; the program is a fixed name.
      child = revealRuntime.spawn(command.program, command.args, {
        shell: false,
        stdio: "ignore",
      });
    } catch (error) {
      logger.debug(`Could not run ${command.program}: ${String(error)}`);
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      logger.debug(`${command.program} did not answer within ${timeoutMs} ms`);
      resolve(false);
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      logger.debug(`Could not run ${command.program}: ${error.message}`);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/**
 * Opens the system file manager on `filePath`, selecting it where the
 * platform allows. Best effort: a missing desktop session is skipped quietly,
 * a failure is only logged, and the scan flow never waits for the file
 * manager itself.
 */
export async function revealScan(filePath: string): Promise<void> {
  const { platform, env } = revealRuntime;
  if (!isDesktopSession(platform, env, revealRuntime.inDocker())) {
    logger.debug("Not revealing the scan: no desktop session");
    return;
  }
  const folder = path.dirname(filePath);
  const now = revealRuntime.now();
  const last = revealRuntime.lastRevealAt.get(folder);
  if (last !== undefined && now - last < REVEAL_DEBOUNCE_MS) {
    logger.debug(
      `Not revealing ${filePath}: ${folder} was revealed ${now - last} ms ago`,
    );
    return;
  }
  revealRuntime.lastRevealAt.set(folder, now);

  const [first, fallback] = buildRevealPlan(filePath, platform);
  if (fallback === undefined) {
    startDetached(first);
    return;
  }
  // Without a session bus the D-Bus call cannot work, so go straight to the
  // fallback rather than wait for it to fail.
  if (
    env["DBUS_SESSION_BUS_ADDRESS"] &&
    (await runWithTimeout(first, revealRuntime.dbusTimeoutMs))
  ) {
    return;
  }
  startDetached(fallback);
}

/**
 * Reveals the first of `filePaths` that is still on disk once the scan was
 * delivered and cleaned up: a scan that `keep_files: false` removed after a
 * successful upload is not revealed, and a multi-page image scan opens one
 * window, not one per page.
 */
export async function revealFirstKept(
  filePaths: readonly string[],
): Promise<void> {
  for (const filePath of filePaths) {
    const stat = await fs.stat(filePath).catch(() => undefined);
    if (stat?.isFile()) {
      await revealScan(filePath);
      return;
    }
  }
}
