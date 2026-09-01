import { describe } from "mocha";
import { expect } from "chai";
import JpegUtil from "../src/imageFormats/JpegUtil.js";
import fs0 from "node:fs";
import fs01 from "node:fs/promises";
import path from "node:path";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fs = { ...fs0, ...fs01 };
describe("JpegUtil", () => {
  describe("Work on sample.jpg", () => {
    it("Reading JPEG size is possible", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./asset/sample.jpg"),
      );

      const size = JpegUtil.GetJpgSize(buffer);

      expect(size?.height).to.be.eq(300);
      expect(size?.width).to.be.eq(400);
    });

    it("Writing JPEG size is possible", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./asset/sample.jpg"),
      );

      const sizeWritten = JpegUtil.setJpgSize(buffer, {
        height: 1200,
        width: 800,
      });
      expect(sizeWritten).to.be.eq(true);

      const size = JpegUtil.GetJpgSize(buffer);

      expect(size?.height).to.be.eq(1200);
      expect(size?.width).to.be.eq(800);
    });
  });
  describe("Jpeg size", () => {
    it("allows to set height", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./asset/adf_bytes_scan.jpg"),
      );

      const sizeWritten = JpegUtil.setJpgSize(buffer, {
        height: 2322,
        width: 1654,
      });
      expect(sizeWritten).to.be.eq(true);

      fs.writeFileSync(
        path.resolve(__dirname, "./asset/adf_bytes_scan_height_fixed.jpg"),
        buffer,
      );
    });
  });
  describe("Fix a corrupted adf scan", () => {
    it("Fix image size based on DNL marker content", async () => {
      const buffer: Buffer = await fs.readFile(
        path.resolve(__dirname, "./asset/adf_bytes_scan.jpg"),
      );

      const sizeFixed = JpegUtil.fixSizeWithDNL(buffer);
      expect(sizeFixed).to.be.eq(2322);

      fs.writeFileSync(
        path.resolve(__dirname, "./asset/adf_bytes_scan_height_fixed.jpg"),
        buffer,
      );
    });
  });

  describe("corrupted jpeg edge cases", () => {
    // minimal SOI + APP0/JFIF header (20 bytes) as expected by JpegUtil.parse
    function jpegBuffer(payload: number[], validJfif = true): Buffer {
      const jfif = validJfif
        ? [0x4a, 0x46, 0x49, 0x46, 0x00]
        : [0x01, 0x02, 0x03, 0x04, 0x00];
      const header = [
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, // SOI + APP0 marker, length 16
        ...jfif, // "JFIF\0"
        0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // rest of APP0
      ];
      return Buffer.from([...header, ...payload]);
    }

    const dnlMarker = [0xff, 0xdc, 0x00, 0x04, 0x00, 0x64]; // 100 lines

    it("returns null when a DNL marker is present but no start of frame", () => {
      const buffer = jpegBuffer(dnlMarker);

      expect(JpegUtil.fixSizeWithDNL(buffer)).to.be.eq(null);
    });

    it("fails cleanly when the JFIF header is missing", () => {
      const buffer = jpegBuffer(dnlMarker, false);

      expect(JpegUtil.GetJpgSize(buffer)).to.be.eq(null);
      expect(JpegUtil.fixSizeWithDNL(buffer)).to.be.eq(null);
    });

    it("reports a premature end of stream while scanning the SOS block", () => {
      // SOS marker followed by bytes ending with a lone 0xff
      const buffer = jpegBuffer([
        0xff, 0xda, 0x00, 0x02, 0x00, 0x01, 0xff,
      ]);

      expect(JpegUtil.fixSizeWithDNL(buffer)).to.be.eq(null);
    });

    it("fails cleanly when a block does not start with a marker", () => {
      const buffer = jpegBuffer([0x12, 0x34]);

      expect(JpegUtil.fixSizeWithDNL(buffer)).to.be.eq(null);
    });

    it("fails cleanly when the stream ends right after a marker byte", () => {
      const buffer = jpegBuffer([0xff]);

      expect(JpegUtil.fixSizeWithDNL(buffer)).to.be.eq(null);
    });

    it("fails cleanly on a 0x00 filler right after a marker byte", () => {
      const buffer = jpegBuffer([0xff, 0x00, 0x12]);

      expect(JpegUtil.fixSizeWithDNL(buffer)).to.be.eq(null);
    });
  });
});
