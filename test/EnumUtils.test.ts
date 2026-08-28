import { describe, it } from "mocha";
import { expect } from "chai";
import { EnumUtils } from "../src/hpModels/EnumUtils.js";

describe("EnumUtils", () => {
  enum DummyState {
    Alpha = "Alpha",
    Beta = "Beta",
  }

  describe("getState", () => {
    it("returns the value when it is a known state", () => {
      expect(EnumUtils.getState("DummyState", DummyState, "Alpha")).to.equal(
        "Alpha",
      );
    });

    it("throws when the value is not a known state (regression: the pino branch logged instead of throwing)", () => {
      expect(() =>
        EnumUtils.getState("DummyState", DummyState, "Unknown"),
      ).to.throw('"Unknown" is not a known DummyState value');
    });
  });
});
