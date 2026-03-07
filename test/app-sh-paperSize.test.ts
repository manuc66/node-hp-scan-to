import { describe, it } from "mocha";
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("app.sh - Paper Size Environment Variables", () => {
  let appShContent: string;

  before(() => {
    const appShPath = path.join(__dirname, "../root/app.sh");
    appShContent = fs.readFileSync(appShPath, "utf-8");
  });

  describe("PAPER_SIZE environment variable", () => {
    it("should have PAPER_SIZE environment variable handling", () => {
      expect(appShContent).to.include("PAPER_SIZE");
    });

    it("should check if PAPER_SIZE is non-empty before using", () => {
      const paperSizeCheck = /if\s+\[\s+-n\s+['"]\$PAPER_SIZE['"]\s+\]/;
      expect(appShContent).to.match(paperSizeCheck);
    });

    it("should append --paper-size flag when PAPER_SIZE is set", () => {
      const paperSizeFlag =
        /ARGS\+=\(['"]-{1,2}paper-size['"]\s+['"]\$PAPER_SIZE['"]\)/;
      expect(appShContent).to.match(paperSizeFlag);
    });

    it("should properly quote PAPER_SIZE variable to handle spaces", () => {
      const quotedVariable = /['"]\$PAPER_SIZE['"]/;
      expect(appShContent).to.match(quotedVariable);
    });
  });

  describe("PAPER_DIM environment variable", () => {
    it("should have PAPER_DIM environment variable handling", () => {
      expect(appShContent).to.include("PAPER_DIM");
    });

    it("should check if PAPER_DIM is non-empty before using", () => {
      const paperDimCheck = /if\s+\[\s+-n\s+['"]\$PAPER_DIM['"]\s+\]/;
      expect(appShContent).to.match(paperDimCheck);
    });

    it("should append --paper-dim flag when PAPER_DIM is set", () => {
      const paperDimFlag =
        /ARGS\+=\(['"]-{1,2}paper-dim['"]\s+['"]\$PAPER_DIM['"]\)/;
      expect(appShContent).to.match(paperDimFlag);
    });

    it("should properly quote PAPER_DIM variable to handle special characters", () => {
      const quotedVariable = /['"]\$PAPER_DIM['"]/;
      expect(appShContent).to.match(quotedVariable);
    });
  });

  describe("Argument order and placement", () => {
    it("should place PAPER_SIZE handling before ADD_EMULATED_DUPLEX", () => {
      const paperSizeIndex = appShContent.indexOf("PAPER_SIZE");
      const emulatedDuplexIndex = appShContent.indexOf("ADD_EMULATED_DUPLEX");
      expect(paperSizeIndex).to.be.lessThan(emulatedDuplexIndex);
    });

    it("should place PAPER_DIM handling before ADD_EMULATED_DUPLEX", () => {
      const paperDimIndex = appShContent.indexOf("PAPER_DIM");
      const emulatedDuplexIndex = appShContent.indexOf("ADD_EMULATED_DUPLEX");
      expect(paperDimIndex).to.be.lessThan(emulatedDuplexIndex);
    });

    it("should place PAPER_SIZE handling after MODE", () => {
      const modeIndex = appShContent.indexOf('if [ -n "$MODE" ]');
      const paperSizeIndex = appShContent.indexOf('if [ -n "$PAPER_SIZE" ]');
      expect(paperSizeIndex).to.be.greaterThan(modeIndex);
    });
  });

  describe("Shell script safety", () => {
    it("should not have unquoted variable expansions for PAPER_SIZE", () => {
      // Look for unquoted variable patterns that could cause issues
      const unsafePattern = /ARGS\+=\(--paper-size\s+\$PAPER_SIZE\)/;
      expect(appShContent).to.not.match(unsafePattern);
    });

    it("should not have unquoted variable expansions for PAPER_DIM", () => {
      // Look for unquoted variable patterns that could cause issues
      const unsafePattern = /ARGS\+=\(--paper-dim\s+\$PAPER_DIM\)/;
      expect(appShContent).to.not.match(unsafePattern);
    });
  });
});
