import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import { readFile } from "fs/promises";
import { setupProgram } from "../src/program.js";
import type { FileConfig } from "../src/type/FileConfig.js";

// Drives the CLI wiring of the discover command (option defaults, action and
// the global preAction hook) through the real commander program.

const fileConfig = { debug: false } as unknown as FileConfig;

describe("program discover command", () => {
  let stdout: string[];
  let stderr: string[];
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
    stdout = [];
    stderr = [];
    console.log = (...args: unknown[]) => {
      stdout.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      stderr.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    nock.cleanAll();
    nock.enableNetConnect();
    process.exitCode = undefined;
  });

  it("sets a non-zero exit code when the zero-second browsing window finds nothing", async () => {
    const program = setupProgram(fileConfig);

    await program.parseAsync(["node", "test", "discover", "--timeout", "0"]);

    expect(process.exitCode).to.equal(1);
    expect(stderr.join("\n")).to.contain("Probing 0 candidate(s)...");
  });

  it("exits 0 when the verified ip hosts an HP scan-capable device", async () => {
    const discoveryTree = await readFile(
      "./test/asset/discoveryTree.xml",
      "utf-8",
    );
    nock("http://127.0.0.1")
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(200, discoveryTree);
    const program = setupProgram(fileConfig);

    await program.parseAsync([
      "node",
      "test",
      "discover",
      "--ip",
      "127.0.0.1",
    ]);

    expect(process.exitCode).to.equal(0);
    expect(stdout).to.deep.equal(["127.0.0.1\t127.0.0.1"]);
  });

  it("outputs devices as JSON with --json", async () => {
    const discoveryTree = await readFile(
      "./test/asset/discoveryTree.xml",
      "utf-8",
    );
    nock("http://127.0.0.1")
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(200, discoveryTree);
    const program = setupProgram(fileConfig);

    await program.parseAsync([
      "node",
      "test",
      "discover",
      "--json",
      "--ip",
      "127.0.0.1",
    ]);

    expect(process.exitCode).to.equal(0);
    expect(JSON.parse(stdout.join(""))).to.deep.equal([
      { name: "127.0.0.1", ip: "127.0.0.1" },
    ]);
  });
});
