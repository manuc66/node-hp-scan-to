import { describe, it } from "mocha";
import { expect } from "chai";
import {
  paperSizePresetToMm,
  parsePaperSize,
  mmToPixels,
  validateAndResolvePaperSize,
  getDefaultPaperSize,
  isMaxPreset,
} from "../src/PaperSize.js";

describe("PaperSize", () => {
  describe("paperSizePresetToMm()", () => {
    it("converts A4 preset to mm", () => {
      const result = paperSizePresetToMm("A4");
      expect(result).to.deep.equal({ widthMm: 210, heightMm: 297 });
    });

    it("converts Letter preset to mm", () => {
      const result = paperSizePresetToMm("Letter");
      expect(result?.widthMm).to.be.approximately(215.9, 0.1);
      expect(result?.heightMm).to.be.approximately(279.4, 0.1);
    });

    it("converts Legal preset to mm", () => {
      const result = paperSizePresetToMm("Legal");
      expect(result?.widthMm).to.be.approximately(215.9, 0.1);
      expect(result?.heightMm).to.be.approximately(355.6, 0.1);
    });

    it("converts A5 preset to mm", () => {
      const result = paperSizePresetToMm("A5");
      expect(result).to.deep.equal({ widthMm: 148, heightMm: 210 });
    });

    it("converts B5 preset to mm", () => {
      const result = paperSizePresetToMm("B5");
      expect(result).to.deep.equal({ widthMm: 176, heightMm: 250 });
    });

    it("is case-insensitive", () => {
      const a4Lowercase = paperSizePresetToMm("a4");
      const a4Uppercase = paperSizePresetToMm("A4");
      const a4MixedCase = paperSizePresetToMm("A4");
      expect(a4Lowercase).to.deep.equal(a4Uppercase);
      expect(a4MixedCase).to.deep.equal(a4Uppercase);
    });

    it("returns null for unknown preset", () => {
      const result = paperSizePresetToMm("Unknown");
      expect(result).to.be.null;
    });

    it("returns null for 'Max' special case", () => {
      const result = paperSizePresetToMm("Max");
      expect(result).to.be.null;
    });
  });

  describe("parsePaperSize()", () => {
    it("parses '21x29.7cm' (A4 in cm)", () => {
      const result = parsePaperSize("21x29.7cm");
      expect(result?.widthMm).to.equal(210);
      expect(result?.heightMm).to.be.approximately(297, 0.1);
    });

    it("parses '8.5x11in' (Letter in inches)", () => {
      const result = parsePaperSize("8.5x11in");
      expect(result?.widthMm).to.be.approximately(215.9, 0.1);
      expect(result?.heightMm).to.be.approximately(279.4, 0.1);
    });

    it("parses '210x297mm' (A4 in mm)", () => {
      const result = parsePaperSize("210x297mm");
      expect(result).to.deep.equal({ widthMm: 210, heightMm: 297 });
    });

    it("parses dimensions with spaces", () => {
      const result = parsePaperSize("210 x 297 mm");
      expect(result).to.deep.equal({ widthMm: 210, heightMm: 297 });
    });

    it("parses with capital 'X'", () => {
      const result = parsePaperSize("210X297mm");
      expect(result).to.deep.equal({ widthMm: 210, heightMm: 297 });
    });

    it("returns null for invalid format", () => {
      expect(parsePaperSize("invalid")).to.be.null;
      expect(parsePaperSize("210x297")).to.be.null; // No unit
      expect(parsePaperSize("210x297inches")).to.be.null; // Invalid unit
    });

    it("returns null for negative dimensions", () => {
      expect(parsePaperSize("-210x297mm")).to.be.null;
      expect(parsePaperSize("210x-297mm")).to.be.null;
    });

    it("returns null for zero dimensions", () => {
      expect(parsePaperSize("0x297mm")).to.be.null;
      expect(parsePaperSize("210x0mm")).to.be.null;
    });
  });

  describe("mmToPixels()", () => {
    it("converts A4 mm to pixels at 200 DPI", () => {
      const result = mmToPixels(210, 297, 200, 200);
      expect(result.widthPx).to.be.approximately(1654, 5);
      expect(result.heightPx).to.be.approximately(2339, 5);
    });

    it("converts Letter mm to pixels at 200 DPI", () => {
      const result = mmToPixels(215.9, 279.4, 200, 200);
      expect(result.widthPx).to.be.approximately(1700, 5);
      expect(result.heightPx).to.be.approximately(2200, 5);
    });

    it("converts at 300 DPI", () => {
      const result = mmToPixels(210, 297, 300, 300);
      expect(result.widthPx).to.be.approximately(2480, 5);
      expect(result.heightPx).to.be.approximately(3508, 5);
    });

    it("handles different X and Y DPI", () => {
      const result = mmToPixels(210, 297, 300, 150);
      expect(result.widthPx).to.be.approximately(2480, 5);
      expect(result.heightPx).to.be.approximately(1754, 5);
    });

    it("ensures minimum 1 pixel", () => {
      const result = mmToPixels(0.1, 0.1, 1, 1);
      expect(result.widthPx).to.equal(1);
      expect(result.heightPx).to.equal(1);
    });
  });

  describe("validateAndResolvePaperSize()", () => {
    it("resolves A4 preset", () => {
      const result = validateAndResolvePaperSize("A4", undefined);
      expect(result?.resolvedMm).to.deep.equal({ widthMm: 210, heightMm: 297 });
      expect(result?.source).to.equal("A4");
    });

    it("resolves custom dimension", () => {
      const result = validateAndResolvePaperSize(undefined, "210x297mm");
      expect(result?.resolvedMm).to.deep.equal({ widthMm: 210, heightMm: 297 });
      expect(result?.source).to.include("Custom");
    });

    it("throws error when both paperSize and paperDim are provided", () => {
      expect(() => {
        validateAndResolvePaperSize("A4", "21x29.7cm");
      }).to.throw(/both/);
    });

    it("throws error for unknown preset", () => {
      expect(() => {
        validateAndResolvePaperSize("Unknown", undefined);
      }).to.throw(/Unknown paper size preset/);
    });

    it("throws error for invalid custom dimension", () => {
      expect(() => {
        validateAndResolvePaperSize(undefined, "invalid");
      }).to.throw(/Invalid paper dimension format/);
    });

    it("returns null for 'Max' preset without device caps", () => {
      const result = validateAndResolvePaperSize("Max", undefined);
      expect(result).to.be.null;
    });

    it("returns null when neither paperSize nor paperDim provided", () => {
      const result = validateAndResolvePaperSize(undefined, undefined);
      expect(result).to.be.null;
    });

    it("logs warning for dimension exceeding device max", () => {
      const result = validateAndResolvePaperSize(
        undefined,
        "300x400mm",
        210,
        297,
      );
      expect(result).not.to.be.null;
    });
  });

  describe("getDefaultPaperSize()", () => {
    it("returns A4", () => {
      const result = getDefaultPaperSize();
      expect(result).to.deep.equal({ widthMm: 210, heightMm: 297 });
    });
  });

  describe("isMaxPreset()", () => {
    it("identifies 'Max' preset", () => {
      expect(isMaxPreset("Max")).to.be.true;
      expect(isMaxPreset("max")).to.be.true;
      expect(isMaxPreset("MAX")).to.be.true;
    });

    it("returns false for other presets", () => {
      expect(isMaxPreset("A4")).to.be.false;
      expect(isMaxPreset("Letter")).to.be.false;
    });

    it("returns false for undefined", () => {
      expect(isMaxPreset(undefined)).to.be.false;
    });
  });
});
