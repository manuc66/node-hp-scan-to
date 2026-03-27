import { describe, it } from "mocha";
import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import { convertToBmp } from "../src/imageFormats/bmp.js";
import { ScanMode } from "../src/type/scanMode.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BMP Conversion", () => {
  const tmpDir = path.resolve(__dirname, "./tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }

  it("converts 24-bit color (RGB) to BMP (BGR, top-down)", async () => {
    const width = 2;
    const height = 2;
    const dpi = 200;
    const inputFile = path.resolve(tmpDir, "input_color.raw");
    const outputFile = path.resolve(tmpDir, "output_color.bmp");

    const rawData = Buffer.from([
      255,
      0,
      0,
      0,
      255,
      0, // Row 0
      0,
      0,
      255,
      255,
      255,
      255, // Row 1
    ]);
    fs.writeFileSync(inputFile, rawData);

    await convertToBmp(
      width,
      height,
      dpi,
      inputFile,
      outputFile,
      ScanMode.Color,
    );

    const bmpData = fs.readFileSync(outputFile);

    expect(bmpData.toString("ascii", 0, 2)).to.equal("BM");
    const pixelOffset = bmpData.readUInt32LE(10);
    expect(pixelOffset).to.equal(54);

    expect(bmpData.readUInt32LE(14)).to.equal(40);
    expect(bmpData.readInt32LE(18)).to.equal(width);
    expect(bmpData.readInt32LE(22)).to.equal(-height);
    expect(bmpData.readUInt16LE(28)).to.equal(24);

    const rowSize = 8;
    let offset = pixelOffset;

    // Row 0
    expect(bmpData[offset]).to.equal(0);
    expect(bmpData[offset + 1]).to.equal(0);
    expect(bmpData[offset + 2]).to.equal(255);
    expect(bmpData[offset + 3]).to.equal(0);
    expect(bmpData[offset + 4]).to.equal(255);
    expect(bmpData[offset + 5]).to.equal(0);

    // Row 1
    offset += rowSize;
    expect(bmpData[offset]).to.equal(255);
    expect(bmpData[offset + 1]).to.equal(0);
    expect(bmpData[offset + 2]).to.equal(0);
    expect(bmpData[offset + 3]).to.equal(255);
    expect(bmpData[offset + 4]).to.equal(255);
    expect(bmpData[offset + 5]).to.equal(255);
  });

  it("throws error if input file size is invalid", async () => {
    const width = 10;
    const height = 10;
    const dpi = 200;
    const inputFile = path.resolve(tmpDir, "too_small.raw");
    const outputFile = path.resolve(tmpDir, "too_small.bmp");

    fs.writeFileSync(inputFile, Buffer.alloc(10));

    try {
      await convertToBmp(
        width,
        height,
        dpi,
        inputFile,
        outputFile,
        ScanMode.Color,
      );
      expect.fail("Should have thrown an error");
    } catch (e: unknown) {
      if (e instanceof Error) {
        expect(e.message).to.match(/Input size mismatch/);
      } else {
        throw e;
      }
    }
  });

  it("converts 8-bit gray to BMP with palette", async () => {
    const width = 3;
    const height = 1;
    const dpi = 72;
    const inputFile = path.resolve(tmpDir, "input_gray.raw");
    const outputFile = path.resolve(tmpDir, "output_gray.bmp");

    const rawData = Buffer.from([0, 128, 255]);
    fs.writeFileSync(inputFile, rawData);

    await convertToBmp(
      width,
      height,
      dpi,
      inputFile,
      outputFile,
      ScanMode.Gray,
    );

    const bmpData = fs.readFileSync(outputFile);
    const pixelOffset = bmpData.readUInt32LE(10);
    const paletteSize = 256 * 4;

    expect(pixelOffset).to.equal(54 + paletteSize);

    const paletteOffset = 54;
    expect(bmpData[paletteOffset + 128 * 4 + 0]).to.equal(128);
    expect(bmpData[paletteOffset + 128 * 4 + 1]).to.equal(128);
    expect(bmpData[paletteOffset + 128 * 4 + 2]).to.equal(128);

    expect(bmpData[pixelOffset]).to.equal(0);
    expect(bmpData[pixelOffset + 1]).to.equal(128);
    expect(bmpData[pixelOffset + 2]).to.equal(255);
  });

  it("converts 1-bit lineart (packed) to BMP with palette", async () => {
    const width = 9;
    const height = 2;
    const dpi = 300;
    const inputFile = path.resolve(tmpDir, "input_line.raw");
    const outputFile = path.resolve(tmpDir, "output_line.bmp");

    // Packed input:
    // Row 0: 10101010 10000000 → 0xAA, 0x80
    // Row 1: 00000000 10000000 → 0x00, 0x80
    const rawData = Buffer.from([0xaa, 0x80, 0x00, 0x80]);

    fs.writeFileSync(inputFile, rawData);

    await convertToBmp(
      width,
      height,
      dpi,
      inputFile,
      outputFile,
      ScanMode.Lineart,
    );

    const bmpData = fs.readFileSync(outputFile);
    const pixelOffset = bmpData.readUInt32LE(10);
    const paletteSize = 2 * 4;

    expect(pixelOffset).to.equal(54 + paletteSize);

    const rowSize = 4;

    expect(bmpData[pixelOffset]).to.equal(0xaa);
    expect(bmpData[pixelOffset + 1]).to.equal(0x80);

    expect(bmpData[pixelOffset + rowSize]).to.equal(0x00);
    expect(bmpData[pixelOffset + rowSize + 1]).to.equal(0x80);
  });

  it("supports inverting colors in lineart mode (packed)", async () => {
    const width = 8;
    const height = 1;
    const dpi = 300;
    const inputFile = path.resolve(tmpDir, "input_invert.raw");
    const outputFile = path.resolve(tmpDir, "output_invert.bmp");

    // 10101010 → invert → 01010101
    const rawData = Buffer.from([0xaa]);
    fs.writeFileSync(inputFile, rawData);

    await convertToBmp(
      width,
      height,
      dpi,
      inputFile,
      outputFile,
      ScanMode.Lineart,
      {
        invert: true,
      },
    );

    const bmpData = fs.readFileSync(outputFile);
    const pixelOffset = bmpData.readUInt32LE(10);

    expect(bmpData[pixelOffset]).to.equal(0x55);
  });
});
