import { describe, it } from "mocha";
import { expect } from "chai";
import {
  getFileNameRules,
  getFileNameValidationErrors,
  validateFilePatternForPlatform,
} from "../src/fileNameValidation.js";

describe("fileNameValidation", () => {
  describe("getFileNameRules per platform", () => {
    it("windows rules forbid its full character set", () => {
      const rules = getFileNameRules("win32");
      for (const c of [`<`, `>`, `:`, `"`, `/`, `\\`, `|`, `?`, `*`]) {
        expect(rules.invalidCharacters).to.include(c);
      }
      expect(rules.reservedBaseNames).to.include("CON");
      expect(rules.reservedBaseNames).to.include("COM1");
      expect(rules.forbidTrailingDotOrSpace).to.be.true;
    });

    it("darwin rules only forbid the POSIX characters", () => {
      const rules = getFileNameRules("darwin");
      expect(rules.invalidCharacters).to.deep.equal([`/`, "\0"]);
      expect(rules.reservedBaseNames).to.be.undefined;
      expect(rules.forbidTrailingDotOrSpace).to.be.undefined;
    });

    it("linux rules only forbid the POSIX characters", () => {
      const rules = getFileNameRules("linux");
      expect(rules.invalidCharacters).to.deep.equal([`/`, "\0"]);
    });
  });

  describe("getFileNameValidationErrors", () => {
    it("accepts a scan file name on windows", () => {
      expect(getFileNameValidationErrors("scan_02.01.2020_030405", "win32")).to
        .be.empty;
    });

    it("flags ':' on windows but not on POSIX platforms", () => {
      expect(getFileNameValidationErrors("scan_02.01.2020_03:04:05", "win32"))
        .to.have.lengthOf(1);
      expect(
        getFileNameValidationErrors("scan_02.01.2020_03:04:05", "win32")[0],
      ).to.include(":");
      expect(getFileNameValidationErrors("scan_03:04:05", "linux")).to.be
        .empty;
      expect(getFileNameValidationErrors("scan_03:04:05", "darwin")).to.be
        .empty;
    });

    it("flags '/' on every platform", () => {
      expect(getFileNameValidationErrors("a/b", "win32")).to.include(
        'the character "/"',
      );
      expect(getFileNameValidationErrors("a/b", "linux")).to.include(
        'the character "/"',
      );
      expect(getFileNameValidationErrors("a/b", "darwin")).to.include(
        'the character "/"',
      );
    });

    it("flags a trailing dot and space on windows only", () => {
      expect(getFileNameValidationErrors("scan.", "win32")).to.deep.include(
        "a trailing dot",
      );
      expect(getFileNameValidationErrors("scan ", "win32")).to.deep.include(
        "a trailing space",
      );
      expect(getFileNameValidationErrors("scan.", "linux")).to.be.empty;
    });

    it("flags reserved device names on windows, including with an extension", () => {
      expect(getFileNameValidationErrors("con", "win32")).to.deep.include(
        'the reserved device name "CON"',
      );
      expect(getFileNameValidationErrors("CON.txt", "win32")).to.deep.include(
        'the reserved device name "CON"',
      );
      expect(getFileNameValidationErrors("con", "linux")).to.be.empty;
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
      ).to.throw(/file name "scan_02\.01\.2020_03:04:05".*the character ":"/);
      expect(() =>
        validateFilePatternForPlatform('"scan"_dd.mm.yyyy_HH:MM:ss', "win32"),
      ).to.throw(/double quotes like "scan"/);
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
      expect(() => validateFilePatternForPlatform("scan/dd.mm.yyyy", "win32"))
        .to.throw();
      expect(() => validateFilePatternForPlatform("scan/dd.mm.yyyy", "linux"))
        .to.throw();
      expect(() =>
        validateFilePatternForPlatform("scan/dd.mm.yyyy", "darwin"),
      ).to.throw();
    });

    it("rejects a pattern rendering a reserved device name on windows", () => {
      // A dateformat pattern can rarely render a reserved device name, since
      // letters are treated as tokens (e.g. "con" renders to "c+0100n"), so
      // the rule is asserted at the getFileNameValidationErrors level above.
      expect(getFileNameValidationErrors("con", "win32")).to.deep.include(
        'the reserved device name "CON"',
      );
    });
  });
});