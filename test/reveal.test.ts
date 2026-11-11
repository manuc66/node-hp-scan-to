import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildRevealPlan,
  isDesktopSession,
  REVEAL_DEBOUNCE_MS,
  revealFirstKept,
  revealRuntime,
  revealScan,
} from "../src/reveal.js";

class FakeChild extends EventEmitter {
  killed = false;
  unrefCalled = false;
  kill(): boolean {
    this.killed = true;
    return true;
  }
  unref(): this {
    this.unrefCalled = true;
    return this;
  }
}

interface SpawnCall {
  program: string;
  args: string[];
  options: SpawnOptions;
  child: FakeChild;
}

const original = { ...revealRuntime };

/** Replaces the spawn with a recorder; `onSpawn` decides how each child ends. */
function recordSpawns(onSpawn?: (call: SpawnCall) => void): SpawnCall[] {
  const calls: SpawnCall[] = [];
  revealRuntime.spawn = (program, args, options) => {
    const call = { program, args, options, child: new FakeChild() };
    calls.push(call);
    if (onSpawn) {
      setImmediate(() => onSpawn(call));
    }
    return call.child as unknown as ChildProcess;
  };
  return calls;
}

function desktop(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = {},
): void {
  revealRuntime.platform = platform;
  revealRuntime.env = env;
  revealRuntime.inDocker = () => false;
}

const linuxSession = {
  DISPLAY: ":0",
  DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
};

describe("reveal", () => {
  beforeEach(() => {
    revealRuntime.lastRevealAt = new Map();
    revealRuntime.now = () => 1_000_000;
  });

  afterEach(() => {
    Object.assign(revealRuntime, original);
  });

  describe("buildRevealPlan", () => {
    it("selects the file with open -R on macOS", () => {
      expect(
        buildRevealPlan("/Users/me/scans/scan1.pdf", "darwin"),
      ).to.deep.equal([
        { program: "open", args: ["-R", "/Users/me/scans/scan1.pdf"] },
      ]);
    });

    it("selects the file with explorer.exe /select on Windows", () => {
      expect(
        buildRevealPlan("C:\\path with spaces\\scan.pdf", "win32"),
      ).to.deep.equal([
        {
          program: "explorer.exe",
          args: ["/select,", "C:\\path with spaces\\scan.pdf"],
        },
      ]);
    });

    it("gives Explorer an absolute path when the scan folder is relative", () => {
      const [command] = buildRevealPlan("scans\\scan.pdf", "win32");
      expect(command.args[0]).to.equal("/select,");
      expect(path.win32.isAbsolute(command.args[1] ?? "")).to.equal(true);
      expect(command.args[1]).to.match(/scans\\scan\.pdf$/);
    });

    it("asks FileManager1 over D-Bus on Linux with a percent-encoded URI, then falls back to xdg-open on the folder", () => {
      expect(
        buildRevealPlan("/home/user/my scans/scan#1,a.pdf", "linux"),
      ).to.deep.equal([
        {
          program: "dbus-send",
          args: [
            "--session",
            "--print-reply",
            "--dest=org.freedesktop.FileManager1",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
            "array:string:file:///home/user/my%20scans/scan%231%2Ca.pdf",
            "string:",
          ],
        },
        { program: "xdg-open", args: ["/home/user/my scans"] },
      ]);
    });
  });

  describe("isDesktopSession", () => {
    it("is false in a container, even on macOS", () => {
      expect(isDesktopSession("darwin", {}, true)).to.equal(false);
    });

    it("is true on macOS and Windows outside a container", () => {
      expect(isDesktopSession("darwin", {}, false)).to.equal(true);
      expect(isDesktopSession("win32", {}, false)).to.equal(true);
    });

    it("needs DISPLAY or WAYLAND_DISPLAY on Linux", () => {
      expect(isDesktopSession("linux", {}, false)).to.equal(false);
      expect(isDesktopSession("linux", { DISPLAY: "" }, false)).to.equal(false);
      expect(isDesktopSession("linux", { DISPLAY: ":0" }, false)).to.equal(
        true,
      );
      expect(
        isDesktopSession("linux", { WAYLAND_DISPLAY: "wayland-0" }, false),
      ).to.equal(true);
    });
  });

  describe("revealScan", () => {
    it("starts open -R detached, without a shell, and does not wait for it", async () => {
      desktop("darwin");
      const calls = recordSpawns();

      await revealScan("/Users/me/scans/scan1.pdf");

      expect(calls).to.have.length(1);
      expect(calls[0]?.program).to.equal("open");
      expect(calls[0]?.args).to.deep.equal(["-R", "/Users/me/scans/scan1.pdf"]);
      expect(calls[0]?.options).to.include({
        shell: false,
        stdio: "ignore",
        detached: true,
      });
      expect(calls[0]?.child.unrefCalled).to.equal(true);
    });

    it("ignores explorer.exe's exit code and survives a spawn error", async () => {
      desktop("win32");
      const calls = recordSpawns((call) => {
        call.child.emit("exit", 1);
        call.child.emit("error", new Error("spawn explorer.exe ENOENT"));
      });

      await revealScan("C:\\scans\\scan1.pdf");
      await new Promise((resolve) => setImmediate(resolve));

      expect(calls.map((c) => c.program)).to.deep.equal(["explorer.exe"]);
      // A hidden window would defeat the reveal: Explorer must not get windowsHide.
      expect(calls[0]?.options.windowsHide).to.not.equal(true);
    });

    it("logs a spawn that throws instead of failing the scan", async () => {
      desktop("linux", linuxSession);
      const programs: string[] = [];
      revealRuntime.spawn = (program) => {
        programs.push(program);
        throw new Error("spawn ENOMEM");
      };

      await revealScan("/home/user/scans/scan1.pdf");

      expect(programs).to.deep.equal(["dbus-send", "xdg-open"]);
    });

    it("does not fall back when the D-Bus call succeeds", async () => {
      desktop("linux", linuxSession);
      const calls = recordSpawns((call) => call.child.emit("exit", 0));

      await revealScan("/home/user/scans/scan1.pdf");

      expect(calls.map((c) => c.program)).to.deep.equal(["dbus-send"]);
      expect(calls[0]?.options).to.include({ shell: false, stdio: "ignore" });
    });

    it("opens the folder with xdg-open when the file manager has no FileManager1", async () => {
      desktop("linux", linuxSession);
      const calls = recordSpawns((call) => {
        if (call.program === "dbus-send") {
          call.child.emit("exit", 1);
        }
      });

      await revealScan("/home/user/scans/scan1.pdf");

      expect(calls.map((c) => c.program)).to.deep.equal([
        "dbus-send",
        "xdg-open",
      ]);
      expect(calls[1]?.args).to.deep.equal(["/home/user/scans"]);
      expect(calls[1]?.options).to.include({ detached: true });
      expect(calls[1]?.child.unrefCalled).to.equal(true);
    });

    it("falls back when dbus-send cannot be started", async () => {
      desktop("linux", linuxSession);
      const calls = recordSpawns((call) => {
        if (call.program === "dbus-send") {
          call.child.emit("error", new Error("spawn dbus-send ENOENT"));
        }
      });

      await revealScan("/home/user/scans/scan1.pdf");

      expect(calls.map((c) => c.program)).to.deep.equal([
        "dbus-send",
        "xdg-open",
      ]);
    });

    it("kills a D-Bus call that does not answer in time and falls back", async () => {
      desktop("linux", linuxSession);
      revealRuntime.dbusTimeoutMs = 10;
      const calls = recordSpawns();

      await revealScan("/home/user/scans/scan1.pdf");

      expect(calls.map((c) => c.program)).to.deep.equal([
        "dbus-send",
        "xdg-open",
      ]);
      expect(calls[0]?.child.killed).to.equal(true);
    });

    it("goes straight to xdg-open without a session bus", async () => {
      desktop("linux", { DISPLAY: ":0" });
      const calls = recordSpawns();

      await revealScan("/home/user/scans/scan1.pdf");

      expect(calls.map((c) => c.program)).to.deep.equal(["xdg-open"]);
    });

    it("does nothing in a container or a headless session", async () => {
      const calls = recordSpawns();
      revealRuntime.platform = "darwin";
      revealRuntime.inDocker = () => true;
      await revealScan("/scans/scan1.pdf");
      desktop("linux", {});
      await revealScan("/scans/scan2.pdf");

      expect(calls).to.deep.equal([]);
    });

    it("reveals a folder again only once the debounce window has passed", async () => {
      desktop("darwin");
      const calls = recordSpawns();
      let now = 1_000_000;
      revealRuntime.now = () => now;

      await revealScan("/scans/scan1.pdf");
      now += REVEAL_DEBOUNCE_MS - 1;
      await revealScan("/scans/scan2.pdf");
      await revealScan("/other/scan3.pdf");
      now += 1;
      await revealScan("/scans/scan4.pdf");

      expect(calls.map((c) => c.args[1])).to.deep.equal([
        "/scans/scan1.pdf",
        "/other/scan3.pdf",
        "/scans/scan4.pdf",
      ]);
    });
  });

  describe("revealFirstKept", () => {
    let folder: string;

    beforeEach(async () => {
      folder = await fs.mkdtemp(path.join(os.tmpdir(), "reveal-test-"));
    });

    afterEach(async () => {
      await fs.rm(folder, { recursive: true, force: true });
    });

    it("reveals the first path still on disk, once", async () => {
      desktop("darwin");
      const calls = recordSpawns();
      const kept = [
        path.join(folder, "scan2.jpg"),
        path.join(folder, "scan3.jpg"),
      ];
      for (const file of kept) {
        await fs.writeFile(file, "page");
      }

      await revealFirstKept([path.join(folder, "scan1.jpg"), ...kept]);

      expect(calls.map((c) => c.args)).to.deep.equal([["-R", kept[0]]]);
    });

    it("reveals nothing when every file was removed", async () => {
      desktop("darwin");
      const calls = recordSpawns();

      await revealFirstKept([path.join(folder, "scan1.pdf"), folder]);

      expect(calls).to.deep.equal([]);
    });
  });
});
