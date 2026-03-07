import { describe, it } from "mocha";
import { expect } from "chai";
import { configSchema } from "../src/type/FileConfig.js";

describe("FileConfig - Width/Height Zero Handling", () => {
  describe("Zod schema should accept width/height = 0", () => {
    it("should accept width = 0 alone", () => {
      const config = { width: 0 };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept height = 0 alone", () => {
      const config = { height: 0 };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept both width = 0 and height = 0", () => {
      const config = { width: 0, height: 0 };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should reject negative width", () => {
      const config = { width: -1 };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
    });

    it("should reject negative height", () => {
      const config = { height: -10 };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
    });
  });

  describe("width/height = 0 should not conflict with paper_size", () => {
    it("should allow paper_size with width = 0", () => {
      const config = {
        paper_size: "A4",
        width: 0,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow paper_size with height = 0", () => {
      const config = {
        paper_size: "A4",
        height: 0,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow paper_size with both width = 0 and height = 0", () => {
      const config = {
        paper_size: "Letter",
        width: 0,
        height: 0,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow paper_dim with width = 0", () => {
      const config = {
        paper_dim: "21x29.7cm",
        width: 0,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow paper_dim with height = 0", () => {
      const config = {
        paper_dim: "8.5x11in",
        height: 0,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });
  });

  describe("width/height = 'max' should not conflict with paper_size", () => {
    it("should allow paper_size with width = 'max'", () => {
      const config = {
        paper_size: "A4",
        width: "max",
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow paper_size with height = 'max'", () => {
      const config = {
        paper_size: "A4",
        height: "max",
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow paper_dim with both width = 'max' and height = 'max'", () => {
      const config = {
        paper_dim: "21x29.7cm",
        width: "max",
        height: "max",
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });
  });

  describe("positive width/height should conflict with paper_size", () => {
    it("should reject paper_size with positive width", () => {
      const config = {
        paper_size: "A4",
        width: 1000,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("width"))).to.be.true;
      }
    });

    it("should reject paper_size with positive height", () => {
      const config = {
        paper_size: "A4",
        height: 1500,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("height"))).to.be.true;
      }
    });

    it("should reject paper_dim with positive width and height", () => {
      const config = {
        paper_dim: "21x29.7cm",
        width: 1000,
        height: 1500,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("width"))).to.be.true;
        expect(result.error.issues.some((issue) => issue.path.includes("height"))).to.be.true;
      }
    });
  });

  describe("mixed scenarios", () => {
    it("should reject paper_size with width = 0 and height = 1500", () => {
      const config = {
        paper_size: "A4",
        width: 0,
        height: 1500,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("height"))).to.be.true;
        // width should not have an issue since it's 0
        expect(result.error.issues.some((issue) => issue.path.includes("width"))).to.be.false;
      }
    });

    it("should reject paper_size with width = 1000 and height = 0", () => {
      const config = {
        paper_size: "A4",
        width: 1000,
        height: 0,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path.includes("width"))).to.be.true;
        // height should not have an issue since it's 0
        expect(result.error.issues.some((issue) => issue.path.includes("height"))).to.be.false;
      }
    });

    it("should accept paper_size with width = 'max' and height = 0", () => {
      const config = {
        paper_size: "A4",
        width: "max",
        height: 0,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept paper_size with width = 0 and height = 'max'", () => {
      const config = {
        paper_size: "A4",
        width: 0,
        height: "max",
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });
  });

  describe("edge case: undefined vs 0", () => {
    it("should allow paper_size with undefined width and height", () => {
      const config = {
        paper_size: "A4",
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow no paper config at all", () => {
      const config = {};
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow only width = 1000 without paper_size", () => {
      const config = {
        width: 1000,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should allow only height = 1500 without paper_size", () => {
      const config = {
        height: 1500,
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });
  });
});


