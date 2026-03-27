import fs from "node:fs";
import { pipeline, Transform, type TransformCallback } from "node:stream";
import { promisify } from "node:util";
import { ScanMode } from "../type/scanMode.js";
import {
  buildSavedImage,
  type DownloadMeta,
  type ImageFormat,
  type SavedImage,
} from "./index.js";
import { DeviceFormat } from "../hpModels/ScanJobSettings.js";
import { DocumentFormatExt } from "../hpModels/EsclScanJobSettings.js";

const pipelineAsync = promisify(pipeline);

// ── Public API ───────────────────────────────────────────────────────────────

export class PpmFormat implements ImageFormat {
  getExtension() {
    // P6/P5/P4 all use .ppm by convention in this codebase;
    // callers that care about the exact format can inspect the header.
    return "ppm";
  }

  getDeviceFormat(): DeviceFormat {
    return DeviceFormat.Raw;
  }

  getDocumentFormatExt(): DocumentFormatExt {
    return DocumentFormatExt.Raw;
  }

  isJpeg() {
    return false;
  }

  async save(
    downloadMeta: DownloadMeta,
    imageWidth: number,
    imageHeight: number,
    xResolution: number,
    mode: ScanMode,
    destinationFilePath: string,
  ): Promise<SavedImage> {
    await convertToPpm(
      imageWidth,
      imageHeight,
      xResolution,
      downloadMeta.path,
      destinationFilePath,
      mode,
    );

    return buildSavedImage(
      destinationFilePath,
      imageWidth,
      imageHeight,
      xResolution,
    );
  }
}

// ── Public conversion function ───────────────────────────────────────────────

export async function convertToPpm(
  width: number,
  height: number,
  _dpi: number, // not used by Netpbm format; kept for API compatibility
  inputFile: string,
  outputFile: string,
  pixelFormat: ScanMode
): Promise<void> {
  validateDimensions(width, height);

  const inputStream = fs.createReadStream(inputFile);
  const outputStream = fs.createWriteStream(outputFile);

  const transformer = new PpmRowTransformer(
    width,
    height,
    pixelFormat
  );

  await pipelineAsync(inputStream, transformer, outputStream);
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    throw new RangeError(`Invalid dimensions: ${width}x${height}`);
  }
}

// ── Format helpers ───────────────────────────────────────────────────────────

/**
 * Returns the number of bytes per row as sent by the device.
 *
 * - Color:   3 bytes/pixel, unpacked
 * - Gray:    1 byte/pixel, unpacked
 * - Lineart: K1 bit-packed, MSB-first, ceil(width/8) bytes/row
 *            (NOT 1 byte/pixel — the device sends packed bits)
 */
function getInputRowSize(width: number, pixelFormat: ScanMode): number {
  switch (pixelFormat) {
    case ScanMode.Color:
      return width * 3;
    case ScanMode.Gray:
      return width;
    case ScanMode.Lineart:
      return Math.ceil(width / 8); // K1 packed: 8 pixels per byte, MSB-first
    default:
      throw new Error(`Unsupported pixel format: ${String(pixelFormat)}`);
  }
}

/**
 * Builds the Netpbm header for the given pixel format:
 *   Color   → P6 (PPM)
 *   Gray    → P5 (PGM)
 *   Lineart → P4 (PBM) — no maxval token
 *          or P5 (PGM) — when lineartAsGray is true
 */
function buildHeader(
  width: number,
  height: number,
  pixelFormat: ScanMode,
): Buffer {
  switch (pixelFormat) {
    case ScanMode.Color:
      return Buffer.from(`P6\n${width} ${height} 255\n`);
    case ScanMode.Gray:
      return Buffer.from(`P5\n${width} ${height} 255\n`);
    case ScanMode.Lineart:
      return Buffer.from(`P4\n${width} ${height}\n`);
  }
}

// ── Stream Transform ─────────────────────────────────────────────────────────

class PpmRowTransformer extends Transform {
  private remainder: Buffer;
  private readonly inputRowSize: number;
  private readonly totalInputBytesExpected: number;
  private totalInputBytesReceived = 0;
  private headerWritten = false;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly pixelFormat: ScanMode,
  ) {
    super();
    this.remainder = Buffer.alloc(0);
    this.inputRowSize = getInputRowSize(width, pixelFormat);
    this.totalInputBytesExpected = this.inputRowSize * height;
  }

  override _transform(
    chunk: Buffer,
    _encoding: string,
    callback: TransformCallback,
  ): void {
    if (!this.headerWritten) {
      this.push(
        buildHeader(this.width, this.height, this.pixelFormat),
      );
      this.headerWritten = true;
    }

    this.totalInputBytesReceived += chunk.length;

    const data =
      this.remainder.length > 0
        ? Buffer.concat([this.remainder, chunk])
        : chunk;

    let offset = 0;

    while (offset + this.inputRowSize <= data.length) {
      const rowData = data.subarray(offset, offset + this.inputRowSize);
      offset += this.inputRowSize;
      this.push(this.encodeRow(rowData));
    }

    this.remainder =
      data.length > offset ? data.subarray(offset) : Buffer.alloc(0);

    callback();
  }

  override _flush(callback: TransformCallback): void {
    if (this.totalInputBytesReceived !== this.totalInputBytesExpected) {
      callback(
        new Error(
          `Input size mismatch: expected ${this.totalInputBytesExpected} bytes, ` +
            `got ${this.totalInputBytesReceived}`,
        ),
      );
      return;
    }
    if (this.remainder.length > 0) {
      callback(
        new Error(
          `Trailing bytes not forming a complete row: ${this.remainder.length}`,
        ),
      );
      return;
    }
    callback();
  }

  private encodeRow(rowData: Buffer): Uint8Array<ArrayBuffer> {
    switch (this.pixelFormat) {
      case ScanMode.Color:
        // Device sends R,G,B — P6 expects R,G,B: direct copy
        return Buffer.from(rowData);

      case ScanMode.Gray:
        // Device sends 1 byte/pixel — P5 expects the same
        return Buffer.from(rowData);

      case ScanMode.Lineart: {
        // Device sends K1 bit-packed, MSB-first, ceil(width/8) bytes/row.
        // K1 polarity: 1=white, 0=black. P4 polarity: 1=black, 0=white.
        // → invert every bit to match P4 convention.

        return rowData.map((b) => ~b & 0xff);
      }
    }
  }
}
