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

// ── Constants ────────────────────────────────────────────────────────────────

const INCHES_PER_METER = 39.3701;
const BMP_FILE_HEADER_SIZE = 14;
const BMP_INFO_HEADER_SIZE = 40;
const BMP_HEADER_SIZE = BMP_FILE_HEADER_SIZE + BMP_INFO_HEADER_SIZE; // 54

// ── Types ────────────────────────────────────────────────────────────────────

interface PixelFormatInfo {
  bitsPerPixel: number;
  palette?: Buffer;
}

// ── Public API ───────────────────────────────────────────────────────────────

export class BmpFormat implements ImageFormat {
  getExtension() {
    return "bmp";
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
    await convertToBmp(
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

export async function convertToBmp(
  width: number,
  height: number,
  dpi: number,
  inputFile: string,
  outputFile: string,
  pixelFormat: ScanMode,
  options: { invert?: boolean } = {},
): Promise<void> {
  validateDimensions(width, height, dpi);

  const formatInfo = getPixelFormatInfo(pixelFormat);
  const geometry = computeGeometry(width, height, dpi, formatInfo);
  const header = buildBmpHeader(width, height, geometry, formatInfo);
  //
  // // ── Debug: preserve raw device output alongside the converted file ──
  // const debugRawPath = outputFile.replace(/\.[^.]+$/, ".raw");
  // await fs.promises.copyFile(inputFile, debugRawPath);
  // // ───────────────────────────────────────────────────────────────────

  const inputStream = fs.createReadStream(inputFile);
  const outputStream = fs.createWriteStream(outputFile);

  const transformer = new BmpRowTransformer(
    width,
    height,
    pixelFormat,
    geometry,
    header,
    formatInfo.palette,
    options,
  );

  await pipelineAsync(inputStream, transformer, outputStream);
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateDimensions(width: number, height: number, dpi: number): void {
  if (width <= 0 || height <= 0) {
    throw new RangeError(`Invalid dimensions: ${width}x${height}`);
  }
  if (dpi <= 0) {
    throw new RangeError(`Invalid DPI: ${dpi}`);
  }
}

// ── Format helpers ───────────────────────────────────────────────────────────

function getPixelFormatInfo(pixelFormat: ScanMode): PixelFormatInfo {
  switch (pixelFormat) {
    case ScanMode.Color:
      return { bitsPerPixel: 24 };

    case ScanMode.Gray:
      return { bitsPerPixel: 8, palette: createGrayPalette() };

    case ScanMode.Lineart:
      // Device sends packed bits, MSB-first, 1 bit per pixel.
      return { bitsPerPixel: 1, palette: createMonoPalette() };

    default:
      throw new Error(`Unsupported pixel format: ${String(pixelFormat)}`);
  }
}

// ── Geometry ─────────────────────────────────────────────────────────────────

interface BmpGeometry {
  /** Bytes per BMP output row (padded to 4-byte boundary) */
  bmpRowSize: number;
  /** Bytes per raw input row as sent by the device */
  inputRowSize: number;
  paletteSize: number;
  colorsInPalette: number;
  fileSize: number;
  ppm: number;
}

function computeGeometry(
  width: number,
  height: number,
  dpi: number,
  formatInfo: PixelFormatInfo,
): BmpGeometry {
  const { bitsPerPixel, palette } = formatInfo;

  let bmpRowSize: number;
  let inputRowSize: number;

  if (bitsPerPixel === 1) {
    // Packed bits, padded to 4-byte boundary for BMP output
    bmpRowSize = ((width + 31) & ~31) >> 3;
    // Device also sends packed: ⌈width / 8⌉ bytes per row
    inputRowSize = Math.ceil(width / 8);
  } else {
    const bytesPerPixel = bitsPerPixel / 8;
    bmpRowSize = (bytesPerPixel * width + 3) & ~3;
    inputRowSize = bytesPerPixel * width;
  }

  const paletteSize = palette?.length ?? 0;
  const colorsInPalette = paletteSize / 4;
  const imageSize = bmpRowSize * height;
  const fileSize = BMP_HEADER_SIZE + paletteSize + imageSize;

  if (fileSize > 0xffffffff) {
    throw new RangeError(
      `BMP file would exceed 4 GiB limit: ${fileSize} bytes`,
    );
  }

  const ppm = Math.round(dpi * INCHES_PER_METER);

  return {
    bmpRowSize,
    inputRowSize,
    paletteSize,
    colorsInPalette,
    fileSize,
    ppm,
  };
}

// ── BMP header ───────────────────────────────────────────────────────────────

function buildBmpHeader(
  width: number,
  height: number,
  geo: BmpGeometry,
  fmt: PixelFormatInfo,
): Buffer {
  const header = Buffer.alloc(BMP_HEADER_SIZE);

  // BITMAPFILEHEADER
  header.write("BM", 0);
  header.writeUInt32LE(geo.fileSize, 2);
  header.writeUInt32LE(0, 6); // reserved
  header.writeUInt32LE(BMP_HEADER_SIZE + geo.paletteSize, 10);

  // BITMAPINFOHEADER
  header.writeUInt32LE(BMP_INFO_HEADER_SIZE, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(-height, 22); // negative → top-down
  header.writeUInt16LE(1, 26); // planes
  header.writeUInt16LE(fmt.bitsPerPixel, 28);
  header.writeUInt32LE(0, 30); // compression: none
  header.writeUInt32LE(geo.bmpRowSize * height, 34);
  header.writeInt32LE(geo.ppm, 38);
  header.writeInt32LE(geo.ppm, 42);
  header.writeUInt32LE(geo.colorsInPalette, 46);
  header.writeUInt32LE(0, 50); // important colors

  return header;
}

// ── Stream Transform ─────────────────────────────────────────────────────────

class BmpRowTransformer extends Transform {
  private readonly bmpRow: Buffer;
  private remainder: Buffer;
  private readonly totalInputBytesExpected: number;
  private totalInputBytesReceived = 0;
  private headerWritten = false;

  constructor(
    private readonly width: number,
    height: number,
    private readonly pixelFormat: ScanMode,
    private readonly geo: BmpGeometry,
    private readonly bmpHeader: Buffer,
    private readonly palette: Buffer | undefined,
    private readonly options: { invert?: boolean },
  ) {
    super();
    this.bmpRow = Buffer.alloc(geo.bmpRowSize);
    this.remainder = Buffer.alloc(0);
    this.totalInputBytesExpected = geo.inputRowSize * height;
  }

  override _transform(
    chunk: Buffer,
    _encoding: string,
    callback: TransformCallback,
  ): void {
    if (!this.headerWritten) {
      this.push(this.bmpHeader);
      if (this.palette) {this.push(this.palette);}
      this.headerWritten = true;
    }

    this.totalInputBytesReceived += chunk.length;

    const data =
      this.remainder.length > 0
        ? Buffer.concat([this.remainder, chunk])
        : chunk;

    const { inputRowSize } = this.geo;
    let offset = 0;

    while (offset + inputRowSize <= data.length) {
      const rowData = data.subarray(offset, offset + inputRowSize);
      offset += inputRowSize;
      this.encodeRow(rowData);
      this.push(Buffer.from(this.bmpRow));
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

  private encodeRow(rowData: Buffer): void {
    this.bmpRow.fill(0);

    switch (this.pixelFormat) {
      case ScanMode.Color:
        // Device: R,G,B — BMP expects B,G,R
        for (let x = 0; x < this.width; x++) {
          const src = x * 3;
          const dst = x * 3;
          this.bmpRow[dst] = rowData[src + 2]; // B
          this.bmpRow[dst + 1] = rowData[src + 1]; // G
          this.bmpRow[dst + 2] = rowData[src]; // R
        }
        break;

      case ScanMode.Gray:
        rowData.copy(this.bmpRow, 0, 0, this.width);
        break;

      case ScanMode.Lineart:
        // Device sends packed bits, MSB-first, 1 = black ink.
        // BMP 1bpp palette: index 0 = black, index 1 = white.
        // So device bit 1 (ink) → BMP bit 1, no remapping needed unless invert.
        for (let byteIdx = 0; byteIdx < Math.ceil(this.width / 8); byteIdx++) {
          let byte = rowData[byteIdx];
          if (this.options.invert === true) {byte ^= 0xff;}
          // Zero-pad the last byte's trailing bits beyond image width
          const bitsInByte = Math.min(8, this.width - byteIdx * 8);
          if (bitsInByte < 8) {
            const mask = (0xff << (8 - bitsInByte)) & 0xff;
            byte &= mask;
          }
          this.bmpRow[byteIdx] = byte;
        }
        break;
    }
  }
}

// ── Palettes ─────────────────────────────────────────────────────────────────

function createGrayPalette(): Buffer {
  const palette = Buffer.alloc(256 * 4);
  for (let i = 0; i < 256; i++) {
    palette[i * 4] = i; // B
    palette[i * 4 + 1] = i; // G
    palette[i * 4 + 2] = i; // R
    palette[i * 4 + 3] = 0; // reserved
  }
  return palette;
}

function createMonoPalette(): Buffer {
  const palette = Buffer.alloc(2 * 4);
  // index 0 = black
  palette[0] = 0;
  palette[1] = 0;
  palette[2] = 0;
  palette[3] = 0;
  // index 1 = white
  palette[4] = 255;
  palette[5] = 255;
  palette[6] = 255;
  palette[7] = 0;
  return palette;
}
