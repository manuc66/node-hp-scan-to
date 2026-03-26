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
  pixelFormat: ScanMode,
  options: { invert?: boolean } = {},
): Promise<void> {
  validateDimensions(width, height);

  const inputBytesPerPixel = getInputBytesPerPixel(pixelFormat);

  const inputStream = fs.createReadStream(inputFile);
  const outputStream = fs.createWriteStream(outputFile);

  const transformer = new PpmRowTransformer(
    width,
    height,
    pixelFormat,
    inputBytesPerPixel,
    options,
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
 * Returns the number of bytes per pixel as sent by the device.
 * Note: for Lineart the device sends 1 unpacked byte per pixel (0 or 1);
 * packing to P4 bit-rows is handled in encodeRow().
 */
function getInputBytesPerPixel(pixelFormat: ScanMode): number {
  switch (pixelFormat) {
    case ScanMode.Color:
      return 3; // R, G, B
    case ScanMode.Gray:
      return 1;
    case ScanMode.Lineart:
      return 1; // unpacked: 0 = black ink, 1 = white paper
    default:
      throw new Error(`Unsupported pixel format: ${String(pixelFormat)}`);
  }
}

/**
 * Builds the Netpbm header for the given pixel format:
 *   Color   → P6 (PPM)
 *   Gray    → P5 (PGM)
 *   Lineart → P4 (PBM) — no maxval token
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
    inputBytesPerPixel: number,
    private readonly options: { invert?: boolean },
  ) {
    super();
    this.remainder = Buffer.alloc(0);
    this.inputRowSize = width * inputBytesPerPixel;
    this.totalInputBytesExpected = this.inputRowSize * height;
  }

  override _transform(
    chunk: Buffer,
    _encoding: string,
    callback: TransformCallback,
  ): void {
    if (!this.headerWritten) {
      this.push(buildHeader(this.width, this.height, this.pixelFormat));
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

  private encodeRow(rowData: Buffer): Buffer {
    switch (this.pixelFormat) {
      case ScanMode.Color:
        // Device sends R,G,B — P6 expects R,G,B: direct copy
        return Buffer.from(rowData);

      case ScanMode.Gray:
        // Device sends 1 byte/pixel — P5 expects the same
        return Buffer.from(rowData);

      case ScanMode.Lineart: {
        // Device sends 1 unpacked byte/pixel: 0 = black ink, 1 = white paper.
        // P4 expects MSB-first packed bits where 1 = black, last byte zero-padded.
        // invert: true flips the interpretation (e.g. for inverted scan sources).
        const packedWidth = Math.ceil(this.width / 8);
        const out = Buffer.alloc(packedWidth, 0);

        for (let x = 0; x < this.width; x++) {
          const isInk = this.options.invert === true
            ? rowData[x] !== 0 // inverted: non-zero device byte = black
            : rowData[x] === 0; // normal:   zero device byte    = black ink

          if (isInk) {
            out[x >> 3] |= 0x80 >> (x & 7);
          }
        }

        return out;
      }
    }
  }
}
