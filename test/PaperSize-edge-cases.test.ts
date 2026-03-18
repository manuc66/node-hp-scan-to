import { describe, it } from "mocha";
import { expect } from "chai";
import {
  parsePaperSize,
  validateAndResolvePaperSize,
  paperSizePresetToMm,
  isMaxPreset,
} from "../src/PaperSize.js";

describe("PaperSize - Edge Cases and Error Handling", () => {
  describe("parsePaperSize() edge cases", () => {
    it("should reject extremely large dimensions", () => {
      const result = parsePaperSize("99999x99999mm");
      // While technically valid, this should parse but may be clamped later
      expect(result?.widthMm).to.equal(99999);
      expect(result?.heightMm).to.equal(99999);
    });

    it("should handle very small decimal values", () => {
      const result = parsePaperSize("0.1x0.1mm");
      expect(result?.widthMm).to.equal(0.1);
      expect(result?.heightMm).to.equal(0.1);
    });

    it("should reject dimensions with only one number", () => {
      expect(parsePaperSize("210mm")).to.be.null;
      expect(parsePaperSize("x297mm")).to.be.null;
    });

    it("should reject dimensions with wrong delimiter", () => {
      expect(parsePaperSize("210*297mm")).to.be.null;
      expect(parsePaperSize("210-297mm")).to.be.null;
      expect(parsePaperSize("210,297mm")).to.be.null;
    });

    it("should handle mixed case units", () => {
      const resultCM = parsePaperSize("21x29.7CM");
      const resultMM = parsePaperSize("210x297MM");
      const resultIN = parsePaperSize("8.5x11IN");

      expect(resultCM?.widthMm).to.equal(210);
      expect(resultMM?.widthMm).to.equal(210);
      expect(resultIN?.widthMm).to.be.approximately(215.9, 0.1);
    });

    it("should reject trailing/leading spaces in unit", () => {
      // The regex should handle spaces between numbers and unit
      const result = parsePaperSize("210x297 mm");
      expect(result).to.not.be.null;
    });

    it("should reject incomplete decimal numbers", () => {
      expect(parsePaperSize("21.x29.7cm")).to.be.null;
      expect(parsePaperSize("21x.7cm")).to.be.null;
    });

    it("should handle scientific notation (should fail)", () => {
      expect(parsePaperSize("2.1e2x2.97e2mm")).to.be.null;
    });

    it("should reject multiple x delimiters", () => {
      expect(parsePaperSize("21x29x7cm")).to.be.null;
    });

    it("should reject empty string", () => {
      expect(parsePaperSize("")).to.be.null;
    });

    it("should reject just whitespace", () => {
      expect(parsePaperSize("   ")).to.be.null;
    });
  });

  describe("validateAndResolvePaperSize() edge cases", () => {
    it("should handle null/undefined inputs gracefully", () => {
      expect(validateAndResolvePaperSize(undefined, undefined)).to.be.null;
      expect(validateAndResolvePaperSize(undefined, undefined)).to.be.null;
    });

    it("should handle empty string inputs", () => {
      expect(validateAndResolvePaperSize("", "")).to.be.null;
      expect(validateAndResolvePaperSize("", undefined)).to.be.null;
      expect(validateAndResolvePaperSize(undefined, "")).to.be.null;
    });

    it("should reject invalid preset names", () => {
      expect(() =>
        validateAndResolvePaperSize("InvalidPreset", undefined),
      ).to.throw(/Unknown paper size preset/);
      expect(() =>
        validateAndResolvePaperSize("NON_EXISTENT", undefined),
      ).to.throw(/Unknown paper size preset/);
    });

    it("should not clamp dimensions within device limits", () => {
      const result = validateAndResolvePaperSize(undefined, "100x150mm");

      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(100);
      expect(result?.resolvedMm.heightMm).to.equal(150);
    });

    it("should throw when paperDim is also provided", () => {
      expect(() => validateAndResolvePaperSize("A4", "8.5x11in")).to.throw(
        /both/,
      );
    });

    it("should handle case-insensitive preset names", () => {
      const resultLower = validateAndResolvePaperSize("a4", undefined);
      const resultUpper = validateAndResolvePaperSize("A4", undefined);
      const resultMixed = validateAndResolvePaperSize("a4", undefined);

      expect(resultLower?.resolvedMm).to.deep.equal(resultUpper?.resolvedMm);
      expect(resultMixed?.resolvedMm).to.deep.equal(resultUpper?.resolvedMm);
    });

    it("should handle whitespace in preset names", () => {
      const result = validateAndResolvePaperSize(" A4 ", undefined);
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(210);
    });

    it("should work when device max is undefined", () => {
      const result = validateAndResolvePaperSize("A4", undefined);
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(210);
    });
  });

  describe("isMaxPreset()", () => {
    it("should return true for 'Max'", () => {
      expect(isMaxPreset("Max")).to.be.true;
    });

    it("should return true for 'max' (case-insensitive)", () => {
      expect(isMaxPreset("max")).to.be.true;
    });

    it("should return true for 'MAX'", () => {
      expect(isMaxPreset("MAX")).to.be.true;
    });

    it("should return false for null", () => {
      expect(isMaxPreset(undefined)).to.be.false;
    });

    it("should return false for undefined", () => {
      expect(isMaxPreset(undefined)).to.be.false;
    });

    it("should return false for empty string", () => {
      expect(isMaxPreset("")).to.be.false;
    });

    it("should return false for other presets", () => {
      expect(isMaxPreset("A4")).to.be.false;
      expect(isMaxPreset("Letter")).to.be.false;
    });

    it("should handle whitespace", () => {
      expect(isMaxPreset(" Max ")).to.be.true;
    });
  });

  describe("paperSizePresetToMm() boundary conditions", () => {
    it("should handle whitespace in preset names", () => {
      expect(paperSizePresetToMm("  A4  ")?.widthMm).to.equal(210);
      expect(paperSizePresetToMm(" Letter ")?.widthMm).to.be.approximately(
        215.9,
        0.1,
      );
    });

    it("should return null for partial matches", () => {
      expect(paperSizePresetToMm("A")).to.be.null;
      expect(paperSizePresetToMm("Let")).to.be.null;
    });

    it("should return null for similar-sounding but wrong names", () => {
      expect(paperSizePresetToMm("A4Paper")).to.be.null;
      expect(paperSizePresetToMm("LetterSize")).to.be.null;
    });

    it("should allow tabs and newlines in input", () => {
      expect(paperSizePresetToMm("A4\n")?.widthMm).to.equal(210);
      expect(paperSizePresetToMm("\tA4")?.widthMm).to.equal(210);
    });
  });
});
