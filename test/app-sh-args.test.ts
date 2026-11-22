import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appShSource = fs.readFileSync(
  path.join(__dirname, "../root/app.sh"),
  "utf8",
);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Runs the real `root/app.sh` with a fake `s6-setuidgid` that records the
 * arguments handed to the application. This pins the container entrypoint
 * behaviour, which the existing regex-based tests cannot do.
 */
function runAppSh(env: Record<string, string>): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-sh-"));
  tempDirs.push(dir);

  const binDir = path.join(dir, "bin");
  fs.mkdirSync(binDir);
  const stub = path.join(binDir, "s6-setuidgid");
  fs.writeFileSync(
    stub,
    '#!/usr/bin/env bash\nprintf "%s\\n" "${@:4}" > "$APP_SH_ARGS_FILE"\n',
  );
  fs.chmodSync(stub, 0o755);

  const argsFile = path.join(dir, "args");
  const script = path.join(dir, "app.sh");
  fs.writeFileSync(
    script,
    appShSource.replace("cd /app || exit", `cd "${dir}" || exit`),
  );

  const result = spawnSync("bash", [script], {
    env: {
      PATH: `${binDir}:${process.env["PATH"] ?? ""}`,
      APP_SH_ARGS_FILE: argsFile,
      ...env,
    },
    encoding: "utf8",
  });
  expect(result.status, result.stderr).to.equal(0);

  return fs
    .readFileSync(argsFile, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

describe("app.sh - container arguments", () => {
  describe("legacy environment (no regression)", () => {
    it("defaults to listen, health check and /scan", () => {
      expect(runAppSh({})).to.deep.equal([
        "listen",
        "--health-check",
        "-d",
        "/scan",
      ]);
    });

    it("keeps the device address, name and label flags", () => {
      expect(
        runAppSh({
          IP: "192.168.0.5",
          NAME: "Officejet",
          LABEL: "Scan to PC",
          DIR: "/data",
        }),
      ).to.deep.equal([
        "listen",
        "--health-check",
        "-a",
        "192.168.0.5",
        "-l",
        "Scan to PC",
        "-n",
        "Officejet",
        "-d",
        "/data",
      ]);
    });

    it("does not add a label to adf-autoscan", () => {
      expect(
        runAppSh({
          MAIN_COMMAND: "adf-autoscan",
          LABEL: "Ignored",
          NAME: "Deskjet",
        }),
      ).to.deep.equal([
        "adf-autoscan",
        "--health-check",
        "-n",
        "Deskjet",
        "-d",
        "/scan",
      ]);
    });

    it("appends CMDLINE last, after the environment flags", () => {
      expect(runAppSh({ CMDLINE: "--debug --resolution 600" })).to.deep.equal([
        "listen",
        "--health-check",
        "-d",
        "/scan",
        "--debug",
        "--resolution",
        "600",
      ]);
    });

    it("still forwards the scan and integration flags", () => {
      expect(
        runAppSh({
          RESOLUTION: "300",
          MODE: "Gray",
          KEEP_FILES: "1",
          PAPERLESS_POST_DOCUMENT_URL: "https://paperless.example/api/",
          PAPERLESS_TOKEN_FILE: "/run/secrets/token",
        }),
      ).to.deep.equal([
        "listen",
        "--health-check",
        "-d",
        "/scan",
        "-r",
        "300",
        "--mode",
        "Gray",
        "-s",
        "https://paperless.example/api/",
        "--paperless-token-file",
        "/run/secrets/token",
        "-k",
      ]);
    });
  });

  describe("selected printer or target", () => {
    it("forwards PRINTER and TARGET without forcing /scan", () => {
      expect(runAppSh({ PRINTER: "officejet", TARGET: "Scan" })).to.deep.equal([
        "listen",
        "--health-check",
        "--printer",
        "officejet",
        "--target",
        "Scan",
      ]);
    });

    it("keeps an explicit DIR even when a printer is selected", () => {
      expect(runAppSh({ PRINTER: "officejet", DIR: "/data" })).to.deep.equal([
        "listen",
        "--health-check",
        "--printer",
        "officejet",
        "-d",
        "/data",
      ]);
    });

    it("does not force /scan when only a target is selected", () => {
      expect(runAppSh({ TARGET: "Archive" })).to.deep.equal([
        "listen",
        "--health-check",
        "--target",
        "Archive",
      ]);
    });
  });
});
