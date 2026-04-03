import { describe, it } from "mocha";
import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import { convertToBmp } from "../src/imageFormats/bmp.js";
import { ScanMode } from "../src/type/scanMode.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseBinFilename(filename: string): {
  width: number;
  height: number;
  dpi: number;
} {
  const dpiMatch = /(\d+)dpi/.exec(filename);
  const dimMatch = /(\d+)x(\d+)/.exec(filename);
  if (!dpiMatch || !dimMatch) {
    throw new Error(`Cannot parse dimensions/dpi from filename: ${filename}`);
  }
  return {
    dpi: parseInt(dpiMatch[1], 10),
    width: parseInt(dimMatch[1], 10),
    height: parseInt(dimMatch[2], 10),
  };
}

function scanModeFromFilename(filename: string): ScanMode {
  if (filename.startsWith("Color")) {
    return ScanMode.Color;
  }
  if (filename.startsWith("Gray")) {
    return ScanMode.Gray;
  }
  if (filename.startsWith("BlackAndWhite1")) {
    return ScanMode.Lineart;
  }
  throw new Error(`Unknown scan mode in filename: ${filename}`);
}

/**
 * Expected BMP pixel data offset (= header size):
 *   Color  : 54          (BITMAPFILEHEADER 14 + BITMAPINFOHEADER 40)
 *   Gray   : 54 + 256*4  (+ 256-entry palette)
 *   Lineart: 54 + 2*4    (+ 2-entry palette)
 */
function expectedPixelOffset(mode: ScanMode): number {
  switch (mode) {
    case ScanMode.Color:
      return 54;
    case ScanMode.Gray:
      return 54 + 256 * 4;
    case ScanMode.Lineart:
      return 54 + 2 * 4;
  }
}

/**
 * Expected BMP pixel data size:
 *   Color  : rowSize = ceil(width*3 / 4)*4
 *   Gray   : rowSize = ceil(width   / 4)*4
 *   Lineart: rowSize = ceil(width   / 32)*4  (packed bits, padded to DWORD)
 */
function expectedPixelBytes(
  mode: ScanMode,
  width: number,
  height: number,
): number {
  let rowSize: number;
  switch (mode) {
    case ScanMode.Color:
      rowSize = Math.ceil((width * 3) / 4) * 4;
      break;
    case ScanMode.Gray:
      rowSize = Math.ceil(width / 4) * 4;
      break;
    case ScanMode.Lineart:
      rowSize = Math.ceil(width / 32) * 4;
      break;
  }
  return rowSize * height;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("BMP Conversion", () => {
  const tmpDir = path.resolve(__dirname, "./tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // ── Synthetic unit tests ────────────────────────────────────────────────────

  it("converts 24-bit color (RGB) to BMP (BGR, top-down)", async () => {
    const width = 2,
      height = 2,
      dpi = 200;
    const inputFile = path.resolve(tmpDir, "input_color.raw");
    const outputFile = path.resolve(tmpDir, "output_color.bmp");

    fs.writeFileSync(
      inputFile,
      Buffer.from([
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
      ]),
    );

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
    // Row 0: RGB(255,0,0)→BGR(0,0,255)  RGB(0,255,0)→BGR(0,255,0)
    expect([
      bmpData[offset],
      bmpData[offset + 1],
      bmpData[offset + 2],
    ]).to.deep.equal([0, 0, 255]);
    expect([
      bmpData[offset + 3],
      bmpData[offset + 4],
      bmpData[offset + 5],
    ]).to.deep.equal([0, 255, 0]);
    // Row 1: RGB(0,0,255)→BGR(255,0,0)  RGB(255,255,255)→BGR(255,255,255)
    offset += rowSize;
    expect([
      bmpData[offset],
      bmpData[offset + 1],
      bmpData[offset + 2],
    ]).to.deep.equal([255, 0, 0]);
    expect([
      bmpData[offset + 3],
      bmpData[offset + 4],
      bmpData[offset + 5],
    ]).to.deep.equal([255, 255, 255]);
  });

  it("throws error if input file size is invalid", async () => {
    const width = 10,
      height = 10,
      dpi = 200;
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
    const width = 3,
      height = 1,
      dpi = 72;
    const inputFile = path.resolve(tmpDir, "input_gray.raw");
    const outputFile = path.resolve(tmpDir, "output_gray.bmp");

    fs.writeFileSync(inputFile, Buffer.from([0, 128, 255]));
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
    expect(pixelOffset).to.equal(54 + 256 * 4);

    const paletteOffset = 54;
    expect(bmpData[paletteOffset + 128 * 4 + 0]).to.equal(128);
    expect(bmpData[paletteOffset + 128 * 4 + 1]).to.equal(128);
    expect(bmpData[paletteOffset + 128 * 4 + 2]).to.equal(128);

    expect(bmpData[pixelOffset + 0]).to.equal(0);
    expect(bmpData[pixelOffset + 1]).to.equal(128);
    expect(bmpData[pixelOffset + 2]).to.equal(255);
  });

  it("converts 1-bit lineart (packed) to BMP with palette", async () => {
    const width = 9,
      height = 2,
      dpi = 300;
    const inputFile = path.resolve(tmpDir, "input_line.raw");
    const outputFile = path.resolve(tmpDir, "output_line.bmp");

    // Row 0: 10101010 10000000 → 0xAA, 0x80
    // Row 1: 00000000 10000000 → 0x00, 0x80
    fs.writeFileSync(inputFile, Buffer.from([0xaa, 0x80, 0x00, 0x80]));
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
    expect(pixelOffset).to.equal(54 + 2 * 4);

    const rowSize = 4;
    expect(bmpData[pixelOffset]).to.equal(0xaa);
    expect(bmpData[pixelOffset + 1]).to.equal(0x80);
    expect(bmpData[pixelOffset + rowSize]).to.equal(0x00);
    expect(bmpData[pixelOffset + rowSize + 1]).to.equal(0x80);
  });

  it("supports inverting colors in lineart mode (packed)", async () => {
    const width = 8,
      height = 1,
      dpi = 300;
    const inputFile = path.resolve(tmpDir, "input_invert.raw");
    const outputFile = path.resolve(tmpDir, "output_invert.bmp");

    fs.writeFileSync(inputFile, Buffer.from([0xaa]));
    await convertToBmp(
      width,
      height,
      dpi,
      inputFile,
      outputFile,
      ScanMode.Lineart,
      { invert: true },
    );

    const bmpData = fs.readFileSync(outputFile);
    const pixelOffset = bmpData.readUInt32LE(10);
    expect(bmpData[pixelOffset]).to.equal(0x55);
  });

  // ── Asset-based integration tests (real scan data) ─────────────────────────

  const assetBase = path.resolve(__dirname, "asset/produced");
  const sources = ["eSCL", "hpScan"] as const;

  for (const source of sources) {
    const sourceDir = path.resolve(assetBase, source);
    const binFiles = fs
      .readdirSync(sourceDir)
      .filter((f) => f.endsWith(".bin"));

    describe(`[${source}] real scan assets`, () => {
      for (const binFile of binFiles) {
        const stem = binFile.replace(".bin", "");
        const { width, height, dpi } = parseBinFilename(binFile);
        const mode = scanModeFromFilename(binFile);
        const pixelOffset = expectedPixelOffset(mode);

        const inputFile = path.resolve(sourceDir, binFile);
        const snapshotFile = path.resolve(sourceDir, `${stem}.bmp`);

        it(`[${source}] ${binFile} → BMP header + pixel byte count`, async () => {
          await convertToBmp(width, height, dpi, inputFile, snapshotFile, mode);

          const bmpData = fs.readFileSync(snapshotFile);

          // BMP signature
          expect(bmpData.toString("ascii", 0, 2)).to.equal("BM");

          // Pixel data offset
          expect(bmpData.readUInt32LE(10)).to.equal(pixelOffset);

          // BITMAPINFOHEADER
          expect(bmpData.readUInt32LE(14)).to.equal(40); // biSize
          expect(bmpData.readInt32LE(18)).to.equal(width); // biWidth
          expect(bmpData.readInt32LE(22)).to.equal(-height); // biHeight (top-down)

          // Bit depth
          const expectedBitCount =
            mode === ScanMode.Color ? 24 : mode === ScanMode.Gray ? 8 : 1; // Lineart
          expect(bmpData.readUInt16LE(28)).to.equal(expectedBitCount);

          // Pixel data size
          const pixelData = bmpData.subarray(pixelOffset);
          expect(pixelData.length).to.equal(
            expectedPixelBytes(mode, width, height),
          );
        });
      }
    });
  }
});
