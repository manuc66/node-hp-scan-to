import fs from "node:fs";
import { ScanMode } from "../type/scanMode";



export function convertToBmp(
  width: number,
  height: number,
  dpi: number,
  inputFile: string,
  outputFile: string,
  pixelFormat: ScanMode,
) {
  let bitsPerPixel: number;
  let paletteSize = 0;
  let colorsInPalette = 0;
  let bytesPerPixel: number;
  let palette: Buffer | undefined;

  switch (pixelFormat) {
    case ScanMode.Color:
      bitsPerPixel = 24;
      bytesPerPixel = 3;
      break;
    case ScanMode.Gray:
      bitsPerPixel = 8;
      bytesPerPixel = 1;
      paletteSize = 256 * 4;
      colorsInPalette = 256;
      palette = Buffer.alloc(paletteSize);
      for (let i = 0; i < 256; i++) {
        palette[i * 4 + 0] = i; // Blue
        palette[i * 4 + 1] = i; // Green
        palette[i * 4 + 2] = i; // Red
        palette[i * 4 + 3] = 0; // Reserved
      }
      break;
    case ScanMode.Lineart:
      bitsPerPixel = 1;
      bytesPerPixel = 1; // For input, 1 byte per pixel (raw); in BMP, packed 8 pixels per byte
      paletteSize = 2 * 4;
      colorsInPalette = 2;
      palette = Buffer.alloc(paletteSize);
      // BMP monochrome palette: entry 0 = black, entry 1 = white
      palette[0] = 0; palette[1] = 0; palette[2] = 0; palette[3] = 0; // Black
      palette[4] = 255; palette[5] = 255; palette[6] = 255; palette[7] = 0; // White
      break;
    default:
      throw new Error("Unsupported pixel format");
  }

  // Row size: each row must be padded to multiple of 4 bytes
  let rowSize: number;
  if (pixelFormat === ScanMode.Lineart) {
    rowSize = Math.ceil(width / 8);
    rowSize = Math.ceil(rowSize / 4) * 4; // pad to 4 bytes
  } else {
    rowSize = Math.ceil((bytesPerPixel * width) / 4) * 4;
  }
  const imageSize = rowSize * height;
  const headerSize = 54;
  const fileSize = headerSize + paletteSize + imageSize;
  const ppm = Math.round(dpi * 39.3701);

  // Read raw image data
  const rawData = fs.readFileSync(inputFile);

  // Prepare BMP header
  const header = Buffer.alloc(headerSize);

  // BITMAPFILEHEADER
  header.write("BM", 0); // Signature
  header.writeUInt32LE(fileSize, 2); // File size
  header.writeUInt32LE(0, 6); // Reserved
  header.writeUInt32LE(headerSize + paletteSize, 10); // Offset to pixel data

  // BITMAPINFOHEADER
  header.writeUInt32LE(40, 14); // DIB header size
  header.writeInt32LE(width, 18); // Image width
  header.writeInt32LE(height, 22); // Image height
  header.writeUInt16LE(1, 26); // Number of color planes
  header.writeUInt16LE(bitsPerPixel, 28); // Bits per pixel
  header.writeUInt32LE(0, 30); // Compression (0 = none)
  header.writeUInt32LE(imageSize, 34); // Image size
  header.writeInt32LE(ppm, 38); // Horizontal resolution
  header.writeInt32LE(ppm, 42); // Vertical resolution
  header.writeUInt32LE(colorsInPalette, 46); // Number of colors in palette
  header.writeUInt32LE(0, 50); // Important colors

  // Prepare BMP pixel data (bottom-up, with row padding)
  const bmpData = Buffer.alloc(imageSize);

  for (let y = 0; y < height; y++) {
    if (pixelFormat === ScanMode.Color) {
      const srcOffset = (height - 1 - y) * width * bytesPerPixel;
      const dstOffset = y * rowSize;
      for (let x = 0; x < width; x++) {
        const iSrc = srcOffset + x * bytesPerPixel;
        const iDst = dstOffset + x * bytesPerPixel;
        bmpData[iDst] = rawData[iSrc + 2]; // B
        bmpData[iDst + 1] = rawData[iSrc + 1]; // G
        bmpData[iDst + 2] = rawData[iSrc]; // R
      }
      // Padding bytes are zero-initialized
    } else if (pixelFormat === ScanMode.Gray) {
      const srcOffset = (height - 1 - y) * width;
      const dstOffset = y * rowSize;
      rawData.copy(bmpData, dstOffset, srcOffset, srcOffset + width);
      // Padding bytes are zero-initialized
    } else if (pixelFormat === ScanMode.Lineart) {
      // Each byte in BMP = 8 pixels. Each pixel in input rawData = 0 (black) or nonzero (white)
      // BMP expects leftmost pixel in MSB
      const srcOffset = (height - 1 - y) * width;
      const dstOffset = y * rowSize;
      for (let byteIdx = 0; byteIdx < Math.ceil(width / 8); byteIdx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelIdx = byteIdx * 8 + bit;
          if (pixelIdx >= width) break;
          const value = rawData[srcOffset + pixelIdx];
          // 0 = black, nonzero = white
          if (value) byte |= (1 << (7 - bit));
        }
        bmpData[dstOffset + byteIdx] = byte;
      }
      // Padding bytes are zero-initialized by default
    }
  }

  // Write BMP to disk
  if (palette) {
    fs.writeFileSync(outputFile, Buffer.concat([header, palette, bmpData]));
  } else {
    fs.writeFileSync(outputFile, Buffer.concat([header, bmpData]));
  }
}

// function reverseBits(byte: number) {
//   byte = ((byte & 0xF0) >> 4) | ((byte & 0x0F) << 4);
//   byte = ((byte & 0xCC) >> 2) | ((byte & 0x33) << 2);
//   byte = ((byte & 0xAA) >> 1) | ((byte & 0x55) << 1);
//   return byte;
// }
//
// // Example usage:
// const width = 1700;
// const height = 2338;
// const dpi = 200;
// const inputFile = "input.raw";
// const outputFile = "output.bmp";
//
// convertToBmp(width, height, dpi, inputFile, outputFile, ScanMode.Color);
//
// console.log(
//   `Conversion complete! Output written to ${outputFile} (DPI: ${dpi}, Format: ${pixelFormat})`,
// );