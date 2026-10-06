import { describe, it } from "mocha";
import { expect } from "chai";
import { configSchema } from "../src/type/FileConfig.js";

describe("FileConfig - Post Command Validation with Zod", () => {
  describe("Valid configurations", () => {
    it("should accept a string post_command", () => {
      const config = { post_command: 'gswin64c -dPDFA=2 "{input}" "{output}"' };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept post_command alongside other options", () => {
      const config = {
        resolution: 300,
        post_command: 'cp "{input}" "{output}"',
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
    it("should reject non-string post_command", () => {
      const config = { post_command: 42 };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("post_command")))
          .to.be.true;
      }
    });

    it("should reject an empty post_command", () => {
      const config = { post_command: "" };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("post_command")))
          .to.be.true;
      }
    });

    it("should reject a whitespace-only post_command", () => {
      const config = { post_command: "   " };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
    });
  });

  describe("Program and arguments form", () => {
    // A post-processing hook runs an external program; spelling it as a
    // program plus an argument list avoids handing the file path to a shell.
    it("should accept post_command as a list of arguments", () => {
      const config = {
        post_command: ["gswin64c", "-dPDFA=2", "{input}", "{output}"],
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.post_command).to.deep.equal([
          "gswin64c",
          "-dPDFA=2",
          "{input}",
          "{output}",
        ]);
      }
    });

    it("should still accept the single-string form", () => {
      const config = { post_command: "exiftool -overwrite_original {input}" };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should reject a list containing a non-string entry", () => {
      const config = { post_command: ["exiftool", 42] };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
    });

    it("should reject an empty argument list", () => {
      const config = { post_command: [] };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
    });
  });
});
