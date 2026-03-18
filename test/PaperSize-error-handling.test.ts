import { describe, it } from "mocha";
import { expect } from "chai";
import { validateAndResolvePaperSize } from "../src/PaperSize.js";

describe("Paper Size Configuration - Error Handling", () => {
  describe("Conflicting Configuration", () => {
    it("should throw when both paperSize and paperDim are set", () => {
      expect(() => validateAndResolvePaperSize("A4", "8.5x11in")).to.throw(
        /both/,
      );
    });

    it("should use paperDim when paperSize is null", () => {
      const result = validateAndResolvePaperSize(null, "100x150mm");
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(100);
      expect(result?.resolvedMm.heightMm).to.equal(150);
      expect(result?.source).to.include("100x150mm");
    });

    it("should use paperDim when paperSize is empty string", () => {
      const result = validateAndResolvePaperSize("", "200x250mm");
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(200);
      expect(result?.resolvedMm.heightMm).to.equal(250);
    });
  });

  describe("Invalid Preset Handling", () => {
    it("should throw for unknown preset", () => {
      expect(() => validateAndResolvePaperSize("A3", null)).to.throw(
        /Unknown paper size preset/,
      );
    });

    it("should throw for misspelled preset", () => {
      expect(() => validateAndResolvePaperSize("Leter", null)).to.throw(
        /Unknown paper size preset/,
      );
      expect(() => validateAndResolvePaperSize("Leagal", null)).to.throw(
        /Unknown paper size preset/,
      );
      expect(() => validateAndResolvePaperSize("A44", null)).to.throw(
        /Unknown paper size preset/,
      );
    });

    it("should throw for numeric preset", () => {
      expect(() => validateAndResolvePaperSize("4", null)).to.throw(
        /Unknown paper size preset/,
      );
      expect(() => validateAndResolvePaperSize("5", null)).to.throw(
        /Unknown paper size preset/,
      );
    });

    it("should throw for preset with extra characters", () => {
      expect(() => validateAndResolvePaperSize("A4Size", null)).to.throw(
        /Unknown paper size preset/,
      );
      expect(() => validateAndResolvePaperSize("Letter-size", null)).to.throw(
        /Unknown paper size preset/,
      );
    });
  });

  describe("Invalid Custom Dimension Handling", () => {
    it("should throw for malformed dimension string", () => {
      expect(() => validateAndResolvePaperSize(null, "210297mm")).to.throw(
        /Invalid paper dimension format/,
      );
      expect(() => validateAndResolvePaperSize(null, "210 297mm")).to.throw(
        /Invalid paper dimension format/,
      );
      expect(() => validateAndResolvePaperSize(null, "210by297mm")).to.throw(
        /Invalid paper dimension format/,
      );
    });

    it("should throw for missing unit", () => {
      expect(() => validateAndResolvePaperSize(null, "210x297")).to.throw(
        /Invalid paper dimension format/,
      );
    });

    it("should throw for invalid unit", () => {
      expect(() => validateAndResolvePaperSize(null, "210x297px")).to.throw(
        /Invalid paper dimension format/,
      );
      expect(() => validateAndResolvePaperSize(null, "210x297dm")).to.throw(
        /Invalid paper dimension format/,
      );
      expect(() => validateAndResolvePaperSize(null, "210x297m")).to.throw(
        /Invalid paper dimension format/,
      );
    });

    it("should throw for dimensions without 'x'", () => {
      expect(() => validateAndResolvePaperSize(null, "210mm")).to.throw(
        /Invalid paper dimension format/,
      );
      expect(() => validateAndResolvePaperSize(null, "297mm")).to.throw(
        /Invalid paper dimension format/,
      );
    });

    it("should throw for reversed format (unit first)", () => {
      expect(() => validateAndResolvePaperSize(null, "mm210x297")).to.throw(
        /Invalid paper dimension format/,
      );
    });

    it("should throw for multiple units", () => {
      expect(() => validateAndResolvePaperSize(null, "210mmx297cm")).to.throw(
        /Invalid paper dimension format/,
      );
    });
  });

  describe("Boundary Value Testing", () => {
    it("should handle extremely small dimensions", () => {
      const result = validateAndResolvePaperSize(null, "1x1mm");
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(1);
      expect(result?.resolvedMm.heightMm).to.equal(1);
    });

    it("should handle extremely large dimensions", () => {
      const result = validateAndResolvePaperSize(null, "1000x1500mm");
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(1000);
      expect(result?.resolvedMm.heightMm).to.equal(1500);
    });

    it("should not clamp when dimensions are within device max", () => {
      const result = validateAndResolvePaperSize(null, "100x150mm");
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(100);
      expect(result?.resolvedMm.heightMm).to.equal(150);
    });
  });

  describe("Device Capability Edge Cases", () => {
    it("should handle null device max dimensions", () => {
      const result = validateAndResolvePaperSize("A4", null);
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(210);
      expect(result?.resolvedMm.heightMm).to.equal(297);
    });

    it("should handle undefined device max dimensions", () => {
      const result = validateAndResolvePaperSize("Letter", null);
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.be.approximately(215.9, 0.1);
    });

    it("should handle Max preset without device capabilities", () => {
      const result = validateAndResolvePaperSize("Max", null);
      // Max without device capabilities should return null
      expect(result).to.be.null;
    });
  });

  describe("Case Sensitivity and Whitespace", () => {
    it("should handle mixed case presets", () => {
      expect(validateAndResolvePaperSize("a4", null)).to.not.be.null;
      expect(validateAndResolvePaperSize("A4", null)).to.not.be.null;
      expect(validateAndResolvePaperSize("letter", null)).to.not.be.null;
      expect(validateAndResolvePaperSize("LETTER", null)).to.not.be.null;
      expect(validateAndResolvePaperSize("Legal", null)).to.not.be.null;
      expect(validateAndResolvePaperSize("LEGAL", null)).to.not.be.null;
    });

    it("should handle whitespace around preset names", () => {
      const result1 = validateAndResolvePaperSize(" A4 ", null);
      const result2 = validateAndResolvePaperSize("A4", null);
      expect(result1?.resolvedMm).to.deep.equal(result2?.resolvedMm);
    });

    it("should handle whitespace in custom dimensions", () => {
      const result = validateAndResolvePaperSize(null, " 210 x 297 mm ");
      expect(result).to.not.be.null;
      expect(result?.resolvedMm.widthMm).to.equal(210);
      expect(result?.resolvedMm.heightMm).to.equal(297);
    });

    it("should handle mixed case units", () => {
      expect(validateAndResolvePaperSize(null, "210x297MM")).to.not.be.null;
      expect(validateAndResolvePaperSize(null, "21x29.7CM")).to.not.be.null;
      expect(validateAndResolvePaperSize(null, "8.5x11IN")).to.not.be.null;
    });
  });

  describe("Source Information", () => {
    it("should include preset name in source", () => {
      const result = validateAndResolvePaperSize("A4", null);
      expect(result?.source).to.include("A4");
    });

    it("should include custom dimensions in source", () => {
      const result = validateAndResolvePaperSize(null, "210x297mm");
      expect(result?.source).to.include("210x297mm");
    });

    it("should provide meaningful source description", () => {
      const result = validateAndResolvePaperSize("Letter", null);
      expect(result?.source).to.be.a("string");
      expect(result?.source.length).to.be.greaterThan(0);
    });
  });

  describe("Realistic User Error Scenarios", () => {
    it("should handle user typing A4 with quotes", () => {
      // User might copy-paste with quotes
      expect(() => validateAndResolvePaperSize('"A4"', null)).to.throw(
        /Unknown paper size preset/,
      );
      expect(() => validateAndResolvePaperSize("'A4'", null)).to.throw(
        /Unknown paper size preset/,
      );
    });

    it("should handle common typos", () => {
      expect(() => validateAndResolvePaperSize("A 4", null)).to.throw(
        /Unknown paper size preset/,
      );
      expect(() => validateAndResolvePaperSize("Let ter", null)).to.throw(
        /Unknown paper size preset/,
      );
    });

    it("should handle dimensions with wrong separator", () => {
      expect(() => validateAndResolvePaperSize(null, "210,297mm")).to.throw(
        /Invalid paper dimension format/,
      );
      expect(() => validateAndResolvePaperSize(null, "210*297mm")).to.throw(
        /Invalid paper dimension format/,
      );
      expect(() => validateAndResolvePaperSize(null, "210:297mm")).to.throw(
        /Invalid paper dimension format/,
      );
    });

    it("should handle dimensions with extra decimal points", () => {
      expect(() => validateAndResolvePaperSize(null, "21.0.0x29.7cm")).to.throw(
        /Invalid paper dimension format/,
      );
    });

    it("should handle incomplete dimensions", () => {
      expect(() => validateAndResolvePaperSize(null, "x297mm")).to.throw(
        /Invalid paper dimension format/,
      );
      expect(() => validateAndResolvePaperSize(null, "210xmm")).to.throw(
        /Invalid paper dimension format/,
      );
    });
  });
});
