import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import {
  installListenerShutdownHandler,
  installShutdownHandler,
} from "../src/commands/shutdown.js";

const tick = (ms = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("installShutdownHandler", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("disposes the listener then exits on the first signal", async () => {
    let disposeCalls = 0;
    let release!: () => void;
    const exits: number[] = [];
    cleanup = installShutdownHandler(
      () =>
        new Promise<void>((resolve) => {
          disposeCalls++;
          release = resolve;
        }),
      { exit: (code) => exits.push(code), graceMs: 5_000 },
    );

    process.emit("SIGTERM");

    expect(disposeCalls).to.equal(1);
    expect(exits).to.deep.equal([]);

    release();
    await tick();
    expect(exits).to.deep.equal([0]);
  });

  it("exits immediately on a second signal while dispose is pending", async () => {
    const exits: number[] = [];
    cleanup = installShutdownHandler(() => new Promise<void>(() => undefined), {
      exit: (code) => exits.push(code),
      graceMs: 5_000,
    });

    process.emit("SIGINT");
    expect(exits).to.deep.equal([]);

    process.emit("SIGINT");
    expect(exits).to.deep.equal([0]);
  });

  it("forces the exit when dispose never settles", async () => {
    const exits: number[] = [];
    cleanup = installShutdownHandler(() => new Promise<void>(() => undefined), {
      exit: (code) => exits.push(code),
      graceMs: 10,
    });

    process.emit("SIGTERM");
    await tick(50);

    expect(exits).to.deep.equal([0]);
  });

  it("exits even when dispose rejects", async () => {
    const exits: number[] = [];
    cleanup = installShutdownHandler(
      async () => {
        throw new Error("subscription removal failed");
      },
      { exit: (code) => exits.push(code), graceMs: 5_000 },
    );

    process.emit("SIGTERM");
    await tick();

    expect(exits).to.deep.equal([0]);
  });

  it("stops handling signals once the returned cleanup runs", async () => {
    const exits: number[] = [];
    cleanup = installShutdownHandler(async () => undefined, {
      exit: (code) => exits.push(code),
      graceMs: 5_000,
    });

    cleanup();
    cleanup = undefined;

    process.emit("SIGTERM");
    await tick();

    expect(exits).to.deep.equal([]);
  });
});

describe("installListenerShutdownHandler", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("un-registers the listener before exiting on Ctrl-C", async () => {
    let disposed = 0;
    const exits: number[] = [];
    cleanup = installListenerShutdownHandler(
      {
        dispose: async () => {
          disposed++;
        },
      },
      { exit: (code) => exits.push(code), graceMs: 5_000 },
    );

    process.emit("SIGINT");
    await tick();

    expect(disposed).to.equal(1);
    expect(exits).to.deep.equal([0]);
  });

  it("exits even when the listener has nothing to un-register", async () => {
    const exits: number[] = [];
    cleanup = installListenerShutdownHandler(
      {},
      { exit: (code) => exits.push(code), graceMs: 5_000 },
    );

    process.emit("SIGTERM");
    await tick();

    expect(exits).to.deep.equal([0]);
  });

  it("exits when un-registering fails", async () => {
    const exits: number[] = [];
    cleanup = installListenerShutdownHandler(
      {
        dispose: async () => {
          throw new Error("un-register failed");
        },
      },
      { exit: (code) => exits.push(code), graceMs: 5_000 },
    );

    process.emit("SIGTERM");
    await tick();

    expect(exits).to.deep.equal([0]);
  });
});
