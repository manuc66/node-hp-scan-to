import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The regression this test guards against (see issue #1688): a bun-compiled
// executable bundles every module, so pino's worker-thread transport cannot
// resolve its "pino-pretty" target at runtime and the process crashes with
// `unable to determine transport target for "pino-pretty"` in pretty mode.
// The test compiles a real bun executable and runs it in pretty mode.
// It is skipped when bun is not available (e.g. on CI jobs that do not
// install bun), so it runs where it matters: the `binaries` release job and
// developer machines with bun installed.

const hasBun = (() => {
  try {
    execFileSync("bun", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const describeWithBun = hasBun ? describe : describe.skip;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(repoRoot, "test", "asset", "bun-logger-entry.ts");

describeWithBun("bun-compiled executable logging", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bun-logger-test-"));
  const binary = path.join(outDir, "bun-logger-test");

  before(function () {
    // Compile a standalone executable from a tiny entry that logs in pretty
    // mode. This reproduces the standalone binaries shipped with releases.
    // No --target is passed so bun compiles for the current host.
    this.timeout(120_000);
    execFileSync("bun", ["build", "--compile", `--outfile=${binary}`, entry], {
      stdio: "ignore",
    });
  });

  after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("runs in pretty mode without crashing", () => {
    // NODE_ENV=test (set by setup-env.js for this mocha run) would disable
    // the logger, so override it for the spawned executable.
    const res = spawnSync(binary, [], {
      env: { ...process.env, LOG_FORMAT: "pretty", NODE_ENV: "production" },
      encoding: "utf8",
    });
    expect(res.status).to.equal(0, `exit code ${res.status}\nstderr: ${res.stderr}`);
    expect(res.stderr).not.to.match(/unable to determine transport target/);
    // the entry logs an info line which the pretty output must carry
    expect(res.stdout).to.contain("hello from a bun-compiled executable");
  });
});