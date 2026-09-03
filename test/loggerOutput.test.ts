import { describe, it } from "mocha";
import { expect } from "chai";
import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// These tests spawn a real node process per LOG_FORMAT/LOG_LEVEL combination
// because logger.ts resolves its format at module-load time. They pin the
// rendered output that integrators and humans see on stdout/stderr.

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const entry = path.join(repoRoot, "test", "asset", "logger-entry.ts");

function runLogger(
  args: string[] = [],
  envOverrides: Record<string, string | undefined> = {},
): SpawnSyncReturns<string> {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env["LOG_FORMAT"];
  delete env["LOG_LEVEL"];
  const options: SpawnSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    env: { ...env, NODE_ENV: "production", ...envOverrides },
  };
  return spawnSync(process.execPath, ["--import", "tsx", entry, ...args], options);
}

function nonEmptyLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function jsonLines(stdout: string): Record<string, unknown>[] {
  return nonEmptyLines(stdout)
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("logger rendered output", () => {
  it("LOG_FORMAT=json emits JSON lines with redacted credentials", () => {
    const res = runLogger([], { LOG_FORMAT: "json" });
    expect(res.status).to.equal(0, `stderr: ${res.stderr}`);

    const lines = jsonLines(res.stdout);
    expect(lines.length).to.equal(3);
    expect(lines[0]["msg"]).to.equal("info message");
    expect(lines[0]["level"]).to.equal(30);
    expect(lines[1]["msg"]).to.equal("warn message");
    expect(lines[1]["level"]).to.equal(40);

    const secrets = lines[2] as Record<string, unknown>;
    expect(secrets["msg"]).to.equal("with secrets");
    expect(secrets["token"]).to.equal("[Redacted]");
    expect((secrets["nested"] as Record<string, unknown>)["password"]).to.equal(
      "[Redacted]",
    );
  });

  it("LOG_FORMAT=plain keeps legacy bare lines and prefixes severity", () => {
    const res = runLogger([], { LOG_FORMAT: "plain" });
    expect(res.status).to.equal(0, `stderr: ${res.stderr}`);

    const lines = nonEmptyLines(res.stdout);
    expect(lines[0]).to.equal("info message");
    expect(lines[1]).to.equal("WARN: warn message");
    expect(lines.some((line) => line.includes("debug message"))).to.equal(
      false,
    );
    expect(lines.some((line) => line.includes("[Redacted]"))).to.equal(true);
  });

  it("LOG_FORMAT=pretty renders time-stamped leveled output", () => {
    const res = runLogger([], { LOG_FORMAT: "pretty" });
    expect(res.status).to.equal(0, `stderr: ${res.stderr}`);

    expect(res.stdout).to.contain("INFO (logger-entry): info message");
    expect(res.stdout).to.contain("WARN (logger-entry): warn message");
  });

  it("auto format falls back to plain outside of a terminal", () => {
    const res = runLogger();
    expect(res.status).to.equal(0, `stderr: ${res.stderr}`);

    expect(nonEmptyLines(res.stdout)[0]).to.equal("info message");
  });

  it("LOG_LEVEL=debug exposes debug lines", () => {
    const res = runLogger([], { LOG_FORMAT: "json", LOG_LEVEL: "debug" });
    expect(res.status).to.equal(0, `stderr: ${res.stderr}`);

    const lines = jsonLines(res.stdout);
    expect(lines.length).to.equal(4);
    expect(lines[2]["level"]).to.equal(20);
    expect(lines[2]["msg"]).to.equal("debug message");
  });

  it("an invalid LOG_LEVEL falls back to info", () => {
    const res = runLogger([], { LOG_FORMAT: "json", LOG_LEVEL: "bogus" });
    expect(res.status).to.equal(0, `stderr: ${res.stderr}`);

    const lines = jsonLines(res.stdout);
    expect(lines.length).to.equal(3);
    expect(lines.some((line) => line["msg"] === "debug message")).to.equal(
      false,
    );
  });

  it("-D on the command line forces the debug level", () => {
    const res = runLogger(["-D"], { LOG_FORMAT: "json" });
    expect(res.status).to.equal(0, `stderr: ${res.stderr}`);

    const lines = jsonLines(res.stdout);
    expect(lines.length).to.equal(4);
    expect(lines[2]["msg"]).to.equal("debug message");
  });
});
