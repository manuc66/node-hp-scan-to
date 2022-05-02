import { describe } from "mocha";
import { expect } from "chai";
import JpegUtil from "../src/JpegUtil";
const fs = { ...require("fs"), ...require("fs/promises") };
const path = require("path");

describe("JpegUtil", () => {
  describe("Work on sample.jpg", () => {
    it("Reading JPEG size is possible", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./sample.jpg")
      );

      const size = JpegUtil.GetJpgSize(buffer);

      expect(size?.height).to.be.eq(300);
      expect(size?.width).to.be.eq(400);
    });

    it("Writing JPEG size is possible", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./sample.jpg")
      );

      JpegUtil.SetJpgSize(buffer, { height: 1200, width: 800 });
      const size = JpegUtil.GetJpgSize(buffer);

      expect(size?.height).to.be.eq(1200);
      expect(size?.width).to.be.eq(800);
    });
  });
});


