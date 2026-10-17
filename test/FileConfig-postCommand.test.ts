import { describe, it } from "mocha";
import { expect } from "chai";
import { configSchema } from "../src/type/FileConfig.js";

// The PDF and image commands share their schema; most cases are checked on
// both keys so neither can drift.
const commandKeys = ["post_command_pdf", "post_command_image"] as const;

describe("FileConfig - Post Command Validation with Zod", () => {
  describe("Valid configurations", () => {
    for (const key of commandKeys) {
      it(`should accept a string ${key}`, () => {
        const config = { [key]: 'gswin64c -dPDFA=2 "{input}" "{output}"' };
        const result = configSchema.safeParse(config);
        expect(result.success).to.be.true;
      });
    }

    it("should accept both commands alongside other options", () => {
      const config = {
        resolution: 300,
        post_command_pdf: 'gs "{input}" "{output}"',
        post_command_image: 'exiftool -overwrite_original "{input}"',
        keep_files: true,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept empty config", () => {
      const config = {};
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });
  });

  describe("Invalid configurations", () => {
    for (const key of commandKeys) {
      it(`should reject non-string ${key}`, () => {
        const config = { [key]: 42 };
        const result = configSchema.safeParse(config);
        expect(result.success).to.be.false;
        if (!result.success) {
          expect(result.error.issues.some((i) => i.path.includes(key))).to.be
            .true;
        }
      });

      it(`should reject an empty ${key}`, () => {
        const config = { [key]: "" };
        const result = configSchema.safeParse(config);
        expect(result.success).to.be.false;
        if (!result.success) {
          expect(result.error.issues.some((i) => i.path.includes(key))).to.be
            .true;
        }
      });

      it(`should reject a whitespace-only ${key}`, () => {
        const config = { [key]: "   " };
        const result = configSchema.safeParse(config);
        expect(result.success).to.be.false;
      });
    }
  });

  describe("Post command timeout", () => {
    it("should accept a positive integer post_command_timeout", () => {
      const config = {
        post_command_pdf: "cp {input} {output}",
        post_command_timeout: 60_000,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should reject a non-positive, non-integer or non-numeric post_command_timeout", () => {
      for (const value of [0, -1, 1.5, "60000"]) {
        const result = configSchema.safeParse({
          post_command_pdf: "cp {input} {output}",
          post_command_timeout: value,
        });
        expect(result.success, `value ${String(value)}`).to.be.false;
      }
    });
  });

  describe("Program and arguments form", () => {
    // A post-processing hook runs an external program; spelling it as a
    // program plus an argument list avoids handing the file path to a shell.
    it("should accept post_command_image as a list of arguments", () => {
      const config = {
        post_command_image: ["magick", "{input}", "{output}"],
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.post_command_image).to.deep.equal([
          "magick",
          "{input}",
          "{output}",
        ]);
      }
    });

    it("should still accept the single-string form", () => {
      const config = {
        post_command_image: "exiftool -overwrite_original {input}",
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    for (const key of commandKeys) {
      it(`should reject a ${key} whose only {input} is the program`, () => {
        // The program is spawned as-is: a placeholder in that position is
        // never substituted, so the command would never receive the scan.
        const config = { [key]: ["{input}", "--flag"] };
        const result = configSchema.safeParse(config);
        expect(result.success).to.be.false;
        if (!result.success) {
          expect(result.error.issues.some((i) => i.path.includes(key))).to.be
            .true;
        }
      });

      it(`should reject a ${key} string whose only {input} is the program`, () => {
        const config = { [key]: '"{input}" --flag' };
        const result = configSchema.safeParse(config);
        expect(result.success).to.be.false;
      });

      it(`should reject a ${key} list containing a non-string entry`, () => {
        const config = { [key]: ["exiftool", 42] };
        const result = configSchema.safeParse(config);
        expect(result.success).to.be.false;
      });

      it(`should reject an empty ${key} argument list`, () => {
        const config = { [key]: [] };
        const result = configSchema.safeParse(config);
        expect(result.success).to.be.false;
      });
    }
  });
});
