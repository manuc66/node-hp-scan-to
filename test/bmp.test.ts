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

  it("converts 24-bit color (RGB) to BMP (BGR, bottom-up)", () => {
    const width = 2;
    const height = 2;
    const dpi = 200;
    const inputFile = path.resolve(tmpDir, "input_color.raw");
    const outputFile = path.resolve(tmpDir, "output_color.bmp");

    // Input data (RGB):
    // Row 0: Red (255, 0, 0), Green (0, 255, 0)
    // Row 1: Blue (0, 0, 255), White (255, 255, 255)
    const rawData = Buffer.from([
      255, 0, 0, 0, 255, 0, // Row 0
      0, 0, 255, 255, 255, 255 // Row 1
    ]);
    fs.writeFileSync(inputFile, rawData);

    convertToBmp(width, height, dpi, inputFile, outputFile, ScanMode.Color);

    const bmpData = fs.readFileSync(outputFile);

    // Header checks (54 bytes)
    expect(bmpData.toString("ascii", 0, 2)).to.equal("BM");
    const pixelOffset = bmpData.readUInt32LE(10);
    expect(pixelOffset).to.equal(54);

    const dibHeaderSize = bmpData.readUInt32LE(14);
    expect(dibHeaderSize).to.equal(40);
    expect(bmpData.readInt32LE(18)).to.equal(width);
    expect(bmpData.readInt32LE(22)).to.equal(-height);
    expect(bmpData.readUInt16LE(28)).to.equal(24); // 24 bits

    // BMP is top-down (since we changed height to -height):
    // Row 0 of BMP (Row 0 of input): Red (255, 0, 0), Green (0, 255, 0)
    // BMP order is BGR:
    // Red pixel -> (0, 0, 255)
    // Green pixel -> (0, 255, 0)
    // Padding to 4 bytes: row is 2*3 = 6 bytes, needs 2 bytes padding

    const rowSize = 8; // (3 bytes * 2 pixels) = 6, padded to 8
    let offset = pixelOffset;

    // Row 0 of BMP (Row 0 of input: 255, 0, 0, 0, 255, 0)
    expect(bmpData[offset]).to.equal(0); // B (from Red)
    expect(bmpData[offset + 1]).to.equal(0); // G
    expect(bmpData[offset + 2]).to.equal(255); // R
    expect(bmpData[offset + 3]).to.equal(0); // B (from Green)
    expect(bmpData[offset + 4]).to.equal(255); // G
    expect(bmpData[offset + 5]).to.equal(0); // R
    // Padding: bmpData[offset + 6], [offset + 7] should be 0

    // Row 1 of BMP (Row 1 of input: 0, 0, 255, 255, 255, 255)
    offset += rowSize;
    expect(bmpData[offset]).to.equal(255); // B (from Blue)
    expect(bmpData[offset + 1]).to.equal(0); // G
    expect(bmpData[offset + 2]).to.equal(0); // R
    expect(bmpData[offset + 3]).to.equal(255); // B (from White)
    expect(bmpData[offset + 4]).to.equal(255); // G
    expect(bmpData[offset + 5]).to.equal(255); // R
  });

  it("throws error if input file size is invalid", () => {
    const width = 10;
    const height = 10;
    const dpi = 200;
    const inputFile = path.resolve(__dirname, "./tmp/too_small.raw");
    const outputFile = path.resolve(__dirname, "./tmp/too_small.bmp");

    fs.writeFileSync(inputFile, Buffer.alloc(10)); // Should be 300 for 10x10 Color

    expect(() =>
      convertToBmp(width, height, dpi, inputFile, outputFile, ScanMode.Color),
    ).to.throw(/Invalid input size/);
  });

  it("converts 8-bit gray to BMP with palette", () => {
    const width = 3;
    const height = 1;
    const dpi = 72;
    const inputFile = path.resolve(tmpDir, "input_gray.raw");
    const outputFile = path.resolve(tmpDir, "output_gray.bmp");

    // Input: Black (0), Mid-gray (128), White (255)
    const rawData = Buffer.from([0, 128, 255]);
    fs.writeFileSync(inputFile, rawData);

    convertToBmp(width, height, dpi, inputFile, outputFile, ScanMode.Gray);

    const bmpData = fs.readFileSync(outputFile);
    const pixelOffset = bmpData.readUInt32LE(10);
    const paletteSize = 256 * 4;
    expect(pixelOffset).to.equal(54 + paletteSize);

    // Check palette (entry 128 should be 128, 128, 128, 0)
    const paletteOffset = 54;
    expect(bmpData[paletteOffset + 128 * 4 + 0]).to.equal(128); // B
    expect(bmpData[paletteOffset + 128 * 4 + 1]).to.equal(128); // G
    expect(bmpData[paletteOffset + 128 * 4 + 2]).to.equal(128); // R

    // Row size: 3 pixels * 1 byte = 3, padded to 4
    expect(bmpData[pixelOffset]).to.equal(0);
    expect(bmpData[pixelOffset + 1]).to.equal(128);
    expect(bmpData[pixelOffset + 2]).to.equal(255);
  });

  it("converts 1-bit lineart to BMP with palette and bit packing", () => {
    const width = 9;
    const height = 2;
    const dpi = 300;
    const inputFile = path.resolve(tmpDir, "input_line.raw");
    const outputFile = path.resolve(tmpDir, "output_line.bmp");

    // Input (raw): 1 byte per pixel, 0 = black, nonzero = white
    // Row 0: 1, 0, 1, 0, 1, 0, 1, 0, 1 (W, B, W, B, W, B, W, B, W)
    // Row 1: 0, 0, 0, 0, 0, 0, 0, 0, 1 (B, B, B, B, B, B, B, B, W)
    const rawData = Buffer.alloc(width * height);
    rawData[0] = 1; rawData[1] = 0; rawData[2] = 1; rawData[3] = 0;
    rawData[4] = 1; rawData[5] = 0; rawData[6] = 1; rawData[7] = 0; rawData[8] = 1;

    rawData[9 + 8] = 1; // last pixel of second row is white

    fs.writeFileSync(inputFile, rawData);

    convertToBmp(width, height, dpi, inputFile, outputFile, ScanMode.Lineart);

    const bmpData = fs.readFileSync(outputFile);
    const pixelOffset = bmpData.readUInt32LE(10);
    const paletteSize = 2 * 4;
    expect(pixelOffset).to.equal(54 + paletteSize);

    // Row size for 9 bits: ceil(9/8) = 2 bytes, padded to 4 bytes
    const rowSize = 4;

    // Row 0 of BMP (Row 0 of input): W, B, W, B, W, B, W, B (first byte: 10101010 = 0xAA), W (second byte: 10000000 = 0x80)
    expect(bmpData[pixelOffset]).to.equal(0xAA);
    expect(bmpData[pixelOffset + 1]).to.equal(0x80);

    // Row 1 of BMP (Row 1 of input): B, B, B, B, B, B, B, B (first byte: 00000000), W (second byte: 10000000 = 0x80)
    expect(bmpData[pixelOffset + rowSize]).to.equal(0x00);
    expect(bmpData[pixelOffset + rowSize + 1]).to.equal(0x80);
  });

  it("supports inverting colors in lineart mode", () => {
    const width = 8;
    const height = 1;
    const dpi = 300;
    const inputFile = path.resolve(tmpDir, "input_invert.raw");
    const outputFile = path.resolve(tmpDir, "output_invert.bmp");

    // 1 0 1 0 1 0 1 0
    const rawData = Buffer.from([1, 0, 1, 0, 1, 0, 1, 0]);
    fs.writeFileSync(inputFile, rawData);

    // With invert: true
    // 1 -> 0, 0 -> 1 => 0 1 0 1 0 1 0 1 = 0x55
    convertToBmp(width, height, dpi, inputFile, outputFile, ScanMode.Lineart, {
      invert: true,
    });

    const bmpData = fs.readFileSync(outputFile);
    const pixelOffset = bmpData.readUInt32LE(10);
    expect(bmpData[pixelOffset]).to.equal(0x55);
  });
});
