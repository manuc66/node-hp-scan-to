import { describe, it } from "mocha";
import { expect } from "chai";
import {
  parsePaperSize,
  validateAndResolvePaperSize,
  mmToPixels,
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
      expect(() => validateAndResolvePaperSize("InvalidPreset", undefined)).to.throw(
        /Unknown paper size preset/,
      );
      expect(() => validateAndResolvePaperSize("A6", undefined)).to.throw(
        /Unknown paper size preset/,
      );
      expect(() => validateAndResolvePaperSize("Tabloid", undefined)).to.throw(
        /Unknown paper size preset/,
      );
    });

    it("should clamp dimensions exceeding device maximum", () => {
      const maxWidthMm = 215.9; // Letter width
      const maxHeightMm = 279.4; // Letter height

      // Custom size larger than device max
      const result = validateAndResolvePaperSize(
        undefined,
        "300x400mm",
        maxWidthMm,
        maxHeightMm,
      );

      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(maxWidthMm);
      expect(result?.resolvedMm.heightMm).to.equal(maxHeightMm);
    });

    it("should not clamp dimensions within device limits", () => {
      const result = validateAndResolvePaperSize(
        undefined,
        "100x150mm",
        300,
        400,
      );

      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(100);
      expect(result?.resolvedMm.heightMm).to.equal(150);
    });

    it("should throw when paperDim is also provided", () => {
      expect(() => validateAndResolvePaperSize("A4", "8.5x11in")).to.throw(
        /both/,
      );
    });

    it("should handle Max preset correctly", () => {
      const result = validateAndResolvePaperSize("Max", undefined, 300, 400);
      // Max preset should return device max
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(300);
      expect(result?.resolvedMm.heightMm).to.equal(400);
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
      const result = validateAndResolvePaperSize(
        "A4",
        undefined,
        undefined,
        undefined,
      );
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(210);
    });
  });

  describe("mmToPixels() edge cases", () => {
    it("should handle zero resolution", () => {
      const result = mmToPixels(210, 297, 0, 0);
      expect(result.widthPx).to.equal(1);
      expect(result.heightPx).to.equal(1);
    });

    it("should handle negative resolution (treated as positive)", () => {
      const result = mmToPixels(210, 297, -300, -300);
      expect(result.widthPx).to.equal(1);
      expect(result.heightPx).to.equal(1);
    });

    it("should handle zero mm", () => {
      const result = mmToPixels(0, 0, 300, 300);
      expect(result.widthPx).to.equal(1);
      expect(result.heightPx).to.equal(1);
    });

    it("should handle negative mm (edge case)", () => {
      const result = mmToPixels(-210, -297, 300, 300);
      expect(result.widthPx).to.equal(1);
      expect(result.heightPx).to.equal(1);
    });

    it("should handle very high resolution", () => {
      const result = mmToPixels(210, 297, 2400, 2400); // 2400 DPI
      expect(result.widthPx).to.be.approximately(19843, 100); // ~19843 pixels
      expect(result.heightPx).to.be.approximately(28063, 100);
    });

    it("should handle very low resolution", () => {
      const result = mmToPixels(210, 297, 50, 50); // 50 DPI
      expect(result.widthPx).to.be.approximately(413, 10);
      expect(result.heightPx).to.be.approximately(585, 10);
    });

    it("should handle fractional mm values", () => {
      const result = mmToPixels(210.5, 297.25, 300, 300);
      expect(result.widthPx).to.be.a("number");
      expect(result.widthPx).to.be.greaterThan(0);
      expect(result.heightPx).to.be.greaterThan(0);
    });

    it("should handle fractional DPI values", () => {
      const result = mmToPixels(210, 297, 299.5, 299.5);
      expect(result.widthPx).to.be.a("number");
      expect(result.widthPx).to.be.greaterThan(0);
      expect(result.heightPx).to.be.greaterThan(0);
    });

    it("should be consistent with reverse calculation", () => {
      const mm = 210;
      const dpi = 300;
      const pixels = mmToPixels(mm, mm, dpi, dpi).widthPx;
      const backToMm = (pixels * 25.4) / dpi;
      expect(backToMm).to.be.approximately(mm, 0.1);
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
      expect(paperSizePresetToMm(" Letter ")?.widthMm).to.be.approximately(215.9, 0.1);
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

  describe("Real-world scenario tests", () => {
    it("should handle A4 preset and convert correctly at standard DPI", () => {
      const preset = paperSizePresetToMm("A4");
      expect(preset).to.not.be.null;
      const result = mmToPixels(preset!.widthMm, preset!.heightMm, 300, 300);

      // A4 at 300 DPI should be approximately 2480 x 3508 pixels
      expect(result.widthPx).to.be.approximately(2480, 10);
      expect(result.heightPx).to.be.approximately(3508, 10);
    });

    it("should handle Letter preset and convert correctly at standard DPI", () => {
      const preset = paperSizePresetToMm("Letter");
      expect(preset).to.not.be.null;
      const result = mmToPixels(preset!.widthMm, preset!.heightMm, 300, 300);

      // Letter at 300 DPI should be approximately 2550 x 3300 pixels
      expect(result.widthPx).to.be.approximately(2550, 10);
      expect(result.heightPx).to.be.approximately(3300, 10);
    });

    it("should handle custom dimension string end-to-end", () => {
      const parsed = parsePaperSize("8.5x11in");
      expect(parsed).to.not.be.null;

      const resolved = validateAndResolvePaperSize(undefined, "8.5x11in");
      expect(resolved).to.not.be.null;

      const result = mmToPixels(
        resolved!.resolvedMm.widthMm,
        resolved!.resolvedMm.heightMm,
        300,
        300,
      );

      expect(result.widthPx).to.be.approximately(2550, 10);
      expect(result.heightPx).to.be.approximately(3300, 10);
    });
  });
});
