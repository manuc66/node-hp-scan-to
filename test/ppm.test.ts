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

/**
 * Finds the end of a Netpbm header.
 * P6/P5 : magic SP width SP height SP maxval NL  → 3 newlines-or-spaces tokens, ends after 3rd NL
 * P4    : magic SP width SP height NL             → pas de maxval
 *
 * Plus simple : on cherche la position juste après le dernier '\n' du header,
 * en comptant les tokens séparés par whitespace selon la magic number.
 */
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

  // Nombre de '\n' à consommer pour atteindre le début des données binaires :
  // P6/P5 : "P6\nW H 255\n" → 2 newlines
  // P4    : "P4\nW H\n"     → 2 newlines aussi
  const newlinesToSkip = 2;
  let remaining = newlinesToSkip;
  let i = 0;
  while (i < data.length && remaining > 0) {
    if (data[i] === 0x0a) {
      remaining--;
    }
    i++;
  }

  return { magic, width, height, maxval, dataOffset: i };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("PPM Conversion", () => {
  const tmpDir = path.resolve(__dirname, "./tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }

  it("converts 24-bit color to P6 PPM", async () => {
    const width = 2;
    const height = 1;
    const inputFile = path.resolve(tmpDir, "input_color.raw");
    const outputFile = path.resolve(tmpDir, "output_color.ppm");

    // RGB: Red, Green
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
    expect(pixels.length).to.equal(6); // 2 pixels × 3 bytes
    // pixel 0 : Red
    expect([...pixels.subarray(0, 3)]).to.deep.equal([255, 0, 0]);
    // pixel 1 : Green
    expect([...pixels.subarray(3, 6)]).to.deep.equal([0, 255, 0]);
  });

  it("converts 8-bit gray to P5 PGM (1 byte/pixel, no RGB expansion)", async () => {
    const width = 3;
    const height = 1;
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
    expect(pixels.length).to.equal(3); // 3 pixels × 1 byte
    expect([...pixels]).to.deep.equal([0, 128, 255]);
  });

  it("converts 1-bit lineart to P4 PBM (packed bits, MSB-first)", async () => {
    const width = 4;
    const height = 1;
    const inputFile = path.resolve(tmpDir, "input_line.raw");
    const outputFile = path.resolve(tmpDir, "output_line.ppm");

    // Device bytes: 0=black, 1=white → pattern: black white black white
    fs.writeFileSync(inputFile, Buffer.from([0, 1, 0, 1]));

    await convertToPpm(
      width,
      height,
      72,
      inputFile,
      outputFile,
      ScanMode.Lineart,
    );

    const data = fs.readFileSync(outputFile);
    const {
      magic,
      width: w,
      height: h,
      maxval,
      dataOffset,
    } = parseNetpbmHeader(data);

    expect(magic).to.equal("P4");
    expect(w).to.equal(4);
    expect(h).to.equal(1);
    expect(maxval).to.be.null;

    const pixels = data.subarray(dataOffset);
    expect(pixels.length).to.equal(1); // ⌈4/8⌉ = 1 packed byte

    // P4: bit 1 = black, MSB first
    // pixels: black white black white → bits: 1 0 1 0 → 0b10100000 = 0xA0
    expect(pixels[0]).to.equal(0b10100000);
  });
});
