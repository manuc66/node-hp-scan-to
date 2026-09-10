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

  it("does not leak SigV4 credentials from an axios network failure", async () => {
    const axios = (await import("axios")).default;
    const accessKey = "AKIA_TEST_ACCESS_KEY";
    const sessionToken = "sts-session-token-secret";
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/20260101/eu-west-1/s3/aws4_request, SignedHeaders=host, Signature=deadbeef`;

    let serialized: unknown;
    try {
      await axios.put("http://127.0.0.1:1/scans/key", Buffer.from("x"), {
        headers: {
          authorization,
          "x-amz-security-token": sessionToken,
        },
      });
      throw new Error("Should have thrown");
    } catch (error) {
      serialized = serializeError(error);
    }

    const dumped = JSON.stringify(serialized);
    expect(dumped).to.not.include(accessKey);
    expect(dumped).to.not.include(sessionToken);
    expect(dumped).to.not.include(authorization);
    expect(dumped).to.not.include("x-amz-security-token");
    expect(serialized).to.not.have.property("config");
    expect(serialized).to.not.have.property("request");
    // L'environnement de test peut renvoyer ECONNREFUSED ou ENETUNREACH,
    // on vérifie simplement que un code d'erreur est présent.
    expect(serialized).to.have.property("code");
  });

  it("recursively serializes error.cause without leaking sensitive data", async () => {
    const cause = new Error("DB connection failed");
    // @ts-expect-error – we deliberately add a non-standard property to test redaction
    (cause as Record<string, unknown>).password = "secret-db-password";

    const error = new Error("Operation failed");
    // @ts-expect-error – we deliberately add a non-standard cause property
    (error as Record<string, unknown>).cause = cause;

    const serialized = serializeError(error) as Record<string, unknown>;

    // The top‑level error keeps its base message; pino combines it with the cause
    expect(serialized).to.have.property("message");
    expect(serialized).to.have.property("type", "Error");

    // The cause should be an object with the same shape
    const causeObj = serialized["cause"] as Record<string, unknown>;
    expect(causeObj).to.be.an("object");
    expect(causeObj).to.have.property("message", "DB connection failed");
    expect(causeObj).to.have.property("type", "Error");

    // Sensitive field from the cause must be redacted
    const causeString = JSON.stringify(causeObj);
    expect(causeString).to.not.include("secret-db-password");
    expect(causeString).to.include("[Redacted]");
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
