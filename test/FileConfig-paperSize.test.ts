import { describe, it } from "mocha";
import { expect } from "chai";
import { configSchema } from "../src/type/FileConfig.js";

describe("FileConfig - Paper Size Validation with Zod", () => {
  describe("Valid configurations", () => {
    it("should accept config with only paper_size", () => {
      const config = { paper_size: "A4" };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept config with only paper_dim", () => {
      const config = { paper_dim: "21x29.7cm" };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept config with neither paper_size nor paper_dim", () => {
      const config = { resolution: 300 };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept config with paper_size and paper_orientation", () => {
      const config = { paper_size: "A4", paper_orientation: "landscape" };
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
    it("should reject config with both paper_size and paper_dim", () => {
      const config = { paper_size: "A4", paper_dim: "21x29.7cm" };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.issues).to.have.lengthOf(2);
        expect(result.error.issues[0].message).to.include(
          "Config cannot specify both paper_size and paper_dim",
        );
        expect(result.error.issues[1].message).to.include(
          "Config cannot specify both paper_size and paper_dim",
        );
      }
    });

    it("should reject config with paper_orientation and paper_dim", () => {
      const config = { paper_orientation: "landscape", paper_dim: "21x29.7cm" };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.path.includes("paper_orientation")),
        ).to.be.true;
      }
    });

    it("should reject config with paper_orientation and width/height", () => {
      const config = {
        paper_orientation: "landscape",
        width: 1000,
        paper_size: "A4",
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.path.includes("paper_orientation")),
        ).to.be.true;
      }
    });

    it("should reject config with paper_orientation without paper_size", () => {
      const config = { paper_orientation: "landscape" };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.path.includes("paper_orientation")),
        ).to.be.true;
      }
    });
  });
});
