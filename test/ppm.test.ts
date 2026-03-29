import { describe, it } from "mocha";
import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import { convertToPpm } from "../src/imageFormats/ppm.js";
import { ScanMode } from "../src/type/scanMode.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNetpbmHeader(data: Buffer): {
  magic: string;
  width: number;
  height: number;
  maxval: number | null;
  dataOffset: number;
} {
  const text = data.toString("ascii", 0, Math.min(data.length, 128));
  const tokens = text.split(/\s+/);

  const magic = tokens[0];
  const width = parseInt(tokens[1], 10);
  const height = parseInt(tokens[2], 10);
  const hasMaxval = magic === "P5" || magic === "P6";
  const maxval = hasMaxval ? parseInt(tokens[3], 10) : null;

  let remaining = 2;
  let i = 0;
  while (i < data.length && remaining > 0) {
    if (data[i] === 0x0a) {remaining--;}
    i++;
  }

  return { magic, width, height, maxval, dataOffset: i };
}

function parseBinFilename(filename: string): {
  width: number;
  height: number;
  dpi: number;
} {
  const dpiMatch = /(\d+)dpi/.exec(filename);
  const dimMatch = /(\d+)x(\d+)/.exec(filename);
  if (!dpiMatch || !dimMatch)
    {throw new Error(`Cannot parse dimensions/dpi from filename: ${filename}`);}
  return {
    dpi: parseInt(dpiMatch[1], 10),
    width: parseInt(dimMatch[1], 10),
    height: parseInt(dimMatch[2], 10),
  };
}

function scanModeFromFilename(filename: string): ScanMode {
  if (filename.startsWith("Color")) {return ScanMode.Color;}
  if (filename.startsWith("Gray")) {return ScanMode.Gray;}
  if (filename.startsWith("BlackAndWhite1")) {return ScanMode.Lineart;}
  throw new Error(`Unknown scan mode in filename: ${filename}`);
}

function expectedMagic(mode: ScanMode): "P4" | "P5" | "P6" {
  switch (mode) {
    case ScanMode.Color:
      return "P6";
    case ScanMode.Gray:
      return "P5";
    case ScanMode.Lineart:
      return "P4";
  }
}

function expectedPixelBytes(
  mode: ScanMode,
  width: number,
  height: number,
): number {
  switch (mode) {
    case ScanMode.Color:
      return width * height * 3;
    case ScanMode.Gray:
      return width * height;
    case ScanMode.Lineart:
      return Math.ceil(width / 8) * height; // P4 packed bits
  }
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("PPM Conversion", () => {
  const tmpDir = path.resolve(__dirname, "./tmp");
  if (!fs.existsSync(tmpDir)) {fs.mkdirSync(tmpDir, { recursive: true });}

  // ── Synthetic unit tests ────────────────────────────────────────────────────

  it("converts 24-bit color to P6 PPM", async () => {
    const width = 2,
      height = 1;
    const inputFile = path.resolve(tmpDir, "input_color.raw");
    const outputFile = path.resolve(tmpDir, "output_color.ppm");

    fs.writeFileSync(inputFile, Buffer.from([255, 0, 0, 0, 255, 0]));
    await convertToPpm(
      width,
      height,
      72,
      inputFile,
      outputFile,
      ScanMode.Color,
    );

    const data = fs.readFileSync(outputFile);
    const {
      magic,
      width: w,
      height: h,
      maxval,
      dataOffset,
    } = parseNetpbmHeader(data);

    expect(magic).to.equal("P6");
    expect(w).to.equal(2);
    expect(h).to.equal(1);
    expect(maxval).to.equal(255);

    const pixels = data.subarray(dataOffset);
    expect(pixels.length).to.equal(6);
    expect([...pixels.subarray(0, 3)]).to.deep.equal([255, 0, 0]);
    expect([...pixels.subarray(3, 6)]).to.deep.equal([0, 255, 0]);
  });

  it("converts 8-bit gray to P5 PGM (1 byte/pixel)", async () => {
    const width = 3,
      height = 1;
    const inputFile = path.resolve(tmpDir, "input_gray.raw");
    const outputFile = path.resolve(tmpDir, "output_gray.ppm");

    fs.writeFileSync(inputFile, Buffer.from([0, 128, 255]));
    await convertToPpm(width, height, 72, inputFile, outputFile, ScanMode.Gray);

    const data = fs.readFileSync(outputFile);
    const {
      magic,
      width: w,
      height: h,
      maxval,
      dataOffset,
    } = parseNetpbmHeader(data);

    expect(magic).to.equal("P5");
    expect(w).to.equal(3);
    expect(h).to.equal(1);
    expect(maxval).to.equal(255);

    const pixels = data.subarray(dataOffset);
    expect(pixels.length).to.equal(3);
    expect([...pixels]).to.deep.equal([0, 128, 255]);
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
        const magic = expectedMagic(mode);

        // Snapshot lives next to the source .bin, same directory
        const inputFile = path.resolve(sourceDir, binFile);
        const snapshotFile = path.resolve(sourceDir, `${stem}.ppm`);

        it(`[${source}] ${binFile} → ${magic} header + correct pixel byte count`, async () => {
          await convertToPpm(width, height, dpi, inputFile, snapshotFile, mode);

          const data = fs.readFileSync(snapshotFile);
          const {
            magic: gotMagic,
            width: w,
            height: h,
            maxval,
            dataOffset,
          } = parseNetpbmHeader(data);

          // Header
          expect(gotMagic).to.equal(magic);
          expect(w).to.equal(width);
          expect(h).to.equal(height);
          if (magic !== "P4") {expect(maxval).to.equal(255);}

          // Pixel data size
          const pixelData = data.subarray(dataOffset);
          expect(pixelData.length).to.equal(
            expectedPixelBytes(mode, width, height),
          );
        });
      }
    });
  }
});
