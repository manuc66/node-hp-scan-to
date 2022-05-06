import { describe } from "mocha";
import { expect } from "chai";
import JpegUtil from "../src/JpegUtil";
const fs = { ...require("fs"), ...require("fs/promises") };
const path = require("path");

describe("JpegUtil", () => {
  describe("Work on sample.jpg", () => {
    it("Reading JPEG size is possible", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./asset/sample.jpg")
      );

      const size = JpegUtil.GetJpgSize(buffer);

      expect(size?.height).to.be.eq(300);
      expect(size?.width).to.be.eq(400);
    });

    it("Writing JPEG size is possible", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./asset/sample.jpg")
      );

      const sizeWritten = JpegUtil.setJpgSize(buffer, {
        height: 1200,
        width: 800,
      });
      expect(sizeWritten).to.be.true;

      const size = JpegUtil.GetJpgSize(buffer);

      expect(size?.height).to.be.eq(1200);
      expect(size?.width).to.be.eq(800);
    });
  });
  describe("Jpeg size", () => {
    it("allows to set height", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./asset/adf_bytes_scan.jpg")
      );

      const sizeWritten = JpegUtil.setJpgSize(buffer, {
        height: 2322,
        width: 1654,
      });
      expect(sizeWritten).to.be.true;

      fs.writeFileSync(
        path.resolve(__dirname, "./asset/adf_bytes_scan_height_fixed.jpg"),
        buffer
      );
    });
  });
  describe("Fix a corrupted adf scan", () => {
    it("Fix image size based on DNL marker content", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./asset/adf_bytes_scan.jpg")
      );

      const sizeFixed = JpegUtil.fixSizeWithDNL(buffer);
      expect(sizeFixed).to.be.true;

      fs.writeFileSync(
        path.resolve(__dirname, "./asset/adf_bytes_scan_height_fixed.jpg"),
        buffer
      );
    });
  });
});
