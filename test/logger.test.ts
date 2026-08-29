import { describe, it } from "mocha";
import { expect } from "chai";
import { shouldUseInProcessPinoPretty } from "../src/logger.js";

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