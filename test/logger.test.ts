import { describe, it } from "mocha";
import { expect } from "chai";
import baseLogger, {
  formatPlainLogMessage,
  serializeError,
  setDebugLevel,
  shouldUseInProcessPinoPretty,
} from "../src/logger.js";

describe("shouldUseInProcessPinoPretty", () => {
  it("uses in-process pino-pretty for the plain mode regardless of runtime", () => {
    expect(shouldUseInProcessPinoPretty(true, false, false)).to.equal(true);
    expect(shouldUseInProcessPinoPretty(true, true, false)).to.equal(true);
    expect(shouldUseInProcessPinoPretty(true, true, true)).to.equal(true);
  });

  it("uses in-process pino-pretty for the pretty mode under Bun (worker transport is not resolvable in compiled binaries)", () => {
    expect(shouldUseInProcessPinoPretty(false, true, true)).to.equal(true);
  });

  it("keeps the worker transport for the pretty mode under Node.js", () => {
    expect(shouldUseInProcessPinoPretty(false, true, false)).to.equal(false);
  });

  it("uses no transport (plain JSON output) when neither plain nor pretty", () => {
    expect(shouldUseInProcessPinoPretty(false, false, false)).to.equal(false);
    expect(shouldUseInProcessPinoPretty(false, false, true)).to.equal(false);
  });
});

describe("serializeError", () => {
  it("passes falsy values through untouched", () => {
    expect(serializeError(null)).to.equal(null);
    expect(serializeError(undefined)).to.equal(undefined);
  });

  it("serializes a plain error", () => {
    const error = new Error("boom");
    const serialized = serializeError(error) as Record<string, unknown>;

    expect(serialized["message"]).to.equal("boom");
    expect(serialized["type"]).to.equal("Error");
    expect(serialized["stack"]).to.be.a("string");
  });

  it("strips axios config and request payloads, keeps the response status", () => {
    const axiosLikeError = Object.assign(new Error("Request failed"), {
      config: { headers: { Authorization: "Token secret" } },
      request: { host: "printer.local" },
      response: { status: 500, statusText: "Internal Server Error" },
    }) as Error;

    const serialized = serializeError(axiosLikeError) as Record<
      string,
      unknown
    >;

    expect(serialized).to.not.have.property("config");
    expect(serialized).to.not.have.property("request");
    expect(serialized["response"]).to.deep.equal({
      status: 500,
      statusText: "Internal Server Error",
    });
  });
});

describe("formatPlainLogMessage", () => {
  it("keeps info and debug messages bare", () => {
    expect(formatPlainLogMessage({ level: 30, msg: "hello" }, "msg")).to.equal(
      "hello",
    );
    expect(formatPlainLogMessage({ level: 20, msg: "hello" }, "msg")).to.equal(
      "hello",
    );
  });

  it("prefixes warn, error and fatal with their upper-cased level", () => {
    expect(formatPlainLogMessage({ level: 40, msg: "careful" }, "msg")).to.equal(
      "WARN: careful",
    );
    expect(formatPlainLogMessage({ level: 50, msg: "bad" }, "msg")).to.equal(
      "ERROR: bad",
    );
    expect(formatPlainLogMessage({ level: 60, msg: "very bad" }, "msg")).to.equal(
      "FATAL: very bad",
    );
  });

  it("treats unknown levels as info", () => {
    expect(formatPlainLogMessage({ msg: "hello" }, "msg")).to.equal("hello");
  });
});

describe("setDebugLevel", () => {
  it("switches the logger level to debug and back", () => {
    setDebugLevel(true);
    expect(baseLogger.level).to.equal("debug");

    setDebugLevel(false);
    expect(baseLogger.level).to.equal("info");
  });
});
