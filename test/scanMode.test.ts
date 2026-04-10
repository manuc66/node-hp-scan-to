import { describe, it } from "mocha";
import { expect } from "chai";
import { parseScanMode, ScanMode } from "../src/type/scanMode.js";

describe("scanMode", () => {
  it("should parse gray", () => {
    expect(parseScanMode("gray")).to.equal(ScanMode.Gray);
    expect(parseScanMode("Gray")).to.equal(ScanMode.Gray);
  });

  it("should parse color", () => {
    expect(parseScanMode("color")).to.equal(ScanMode.Color);
    expect(parseScanMode("Color")).to.equal(ScanMode.Color);
  });

  it("should parse lineart", () => {
    expect(parseScanMode("lineart")).to.equal(ScanMode.Lineart);
    expect(parseScanMode("Lineart")).to.equal(ScanMode.Lineart);
  });

  it("should return undefined for unknown mode", () => {
    expect(parseScanMode("unknown")).to.be.undefined;
  });
});
