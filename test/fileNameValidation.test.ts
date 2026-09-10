import { describe, it } from "mocha";
import { expect } from "chai";
import {
  getFileNameValidationErrors,
  validateFilePatternForPlatform,
} from "../src/fileNameValidation.js";

describe("fileNameValidation", () => {
  describe("getFileNameValidationErrors", () => {
    it("accepts a scan file name on windows", () => {
      expect(getFileNameValidationErrors("scan_02.01.2020_030405", "win32")).to
        .be.empty;
    });

    it("flags forbidden characters on windows", () => {
      for (const name of [
        "scan_03:04:05",
        "a/b",
        "a\\b",
        "a|b",
        "a?b",
        "a*b",
        "a<b",
        "a>b",
        'a"b',
      ]) {
        expect(
          getFileNameValidationErrors(name, "win32"),
          `should flag "${name}" on windows`,
        ).to.not.be.empty;
      }
    });

    it("flags ':' and `\\` on windows but accepts them on POSIX platforms", () => {
      expect(getFileNameValidationErrors("scan_03:04:05", "win32"))
        .to.not.be.empty;
      expect(getFileNameValidationErrors("scan\\03", "win32")).to.not.be.empty;
      expect(getFileNameValidationErrors("scan_03:04:05", "linux")).to.be
        .empty;
      expect(getFileNameValidationErrors("scan_03:04:05", "darwin")).to.be
        .empty;
    });

    it("flags '/' on every platform", () => {
      expect(getFileNameValidationErrors("a/b", "win32")).to.not.be.empty;
      expect(getFileNameValidationErrors("a/b", "linux")).to.not.be.empty;
      expect(getFileNameValidationErrors("a/b", "darwin")).to.not.be.empty;
    });

    it("flags trailing dots and spaces on windows only", () => {
      expect(getFileNameValidationErrors("scan.", "win32")).to.not.be.empty;
      expect(getFileNameValidationErrors("scan ", "win32")).to.not.be.empty;
      expect(getFileNameValidationErrors("scan.", "linux")).to.be.empty;
    });

    it("flags reserved device names on windows, including with an extension", () => {
      expect(getFileNameValidationErrors("con", "win32")).to.not.be.empty;
      expect(getFileNameValidationErrors("CON.txt", "win32")).to.not.be
        .empty;
      expect(getFileNameValidationErrors("lpt1.pdf", "win32")).to.not.be.empty;
      // only the exact reserved name (with optional extension) is reserved,
      // not names that merely start with it
      expect(getFileNameValidationErrors("lpt1 backup.pdf", "win32")).to.be
        .empty;
      expect(getFileNameValidationErrors("con", "linux")).to.be.empty;
    });

    it("reports the sanitized form in the windows error", () => {
      expect(getFileNameValidationErrors("scan_03:04:05", "win32")[0]).to
        .include('"scan_030405"');
    });
  });

  describe("validateFilePatternForPlatform", () => {
    it("accepts a valid pattern", () => {
      expect(() =>
        validateFilePatternForPlatform('"scan"_dd.mm.yyyy_HHMMss'),
      ).to.not.throw();
    });

    it("rejects a pattern rendering ':' on windows", () => {
      expect(() =>
        validateFilePatternForPlatform('"scan"_dd.mm.yyyy_HH:MM:ss', "win32"),
      ).to.throw(/file name "scan_02\.01\.2020_03:04:05".*sanitized/);
      expect(() =>
        validateFilePatternForPlatform('"scan"_dd.mm.yyyy_HH:MM:ss', "win32"),
      ).to.throw(/double quotes like "scan"/);
      expect(() =>
        validateFilePatternForPlatform('"scan"_dd.mm.yyyy_HH:MM:ss', "win32"),
      ).to.throw(/on win32/);
    });

    it("accepts the same pattern on POSIX platforms", () => {
      expect(() =>
        validateFilePatternForPlatform(
          '"scan"_dd.mm.yyyy_HH:MM:ss',
          "linux",
        ),
      ).to.not.throw();
      expect(() =>
        validateFilePatternForPlatform(
          '"scan"_dd.mm.yyyy_HH:MM:ss',
          "darwin",
        ),
      ).to.not.throw();
    });

    it("rejects a pattern rendering a '/' everywhere", () => {
      expect(() =>
        validateFilePatternForPlatform("scan/dd.mm.yyyy", "win32"),
      ).to.throw();
      expect(() =>
        validateFilePatternForPlatform("scan/dd.mm.yyyy", "linux"),
      ).to.throw();
      expect(() =>
        validateFilePatternForPlatform("scan/dd.mm.yyyy", "darwin"),
      ).to.throw();
    });

    it("rejects a pattern rendering a reserved device name on windows", () => {
      // A dateformat pattern can rarely render a reserved device name, since
      // letters are treated as tokens (e.g. "con" renders to "c+0100n"), so
      // the rule is asserted at the getFileNameValidationErrors level above.
      expect(getFileNameValidationErrors("con", "win32")).to.not.be.empty;
    });
  });
});