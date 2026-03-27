import type { ScanMode } from "../type/scanMode.js";
import type { DeviceFormat } from "../hpModels/ScanJobSettings.js";
import type { DocumentFormatExt } from "../hpModels/EsclScanJobSettings.js";
import { ScanFormat } from "../type/scanFormat.js";
import { JpegFormat } from "./jpeg.js";
import { BmpFormat } from "./bmp.js";
import { PpmFormat } from "./ppm.js";
import { RawFormat } from "./raw.js";

export interface SavedImage {
  path: string;
  width: number;
  height: number;
  xResolution: number;
  yResolution: number;
}

export interface DownloadMeta {
  path: string;
  contentType: string | undefined;
}

export interface ImageFormat {
  getExtension(): string;
  getDeviceFormat(): DeviceFormat;
  getDocumentFormatExt(): DocumentFormatExt;
  isJpeg(): boolean;
  save(
    downloadMeta: DownloadMeta,
    imageWidth: number | null,
    imageHeight: number | null,
    xResolution: number | null,
    mode: ScanMode,
    destinationFilePath: string,
  ): Promise<SavedImage>;
}

export interface JobDesc {
  yResolution: number;
  xResolution: number;
  imageWidth: number;
  imageHeight: number;
  binaryURL: string;
  currentPageNumber: string;
}

export function buildSavedImage(
  path: string,
  width: number,
  height: number,
  dpi: number,
): SavedImage {
  return {
    path,
    width,
    height,
    xResolution: dpi,
    yResolution: dpi,
  };
}

export function createImageFormat(effectiveFormat: ScanFormat): ImageFormat {
  switch (effectiveFormat) {
    case ScanFormat.Jpeg:
      return new JpegFormat();
    case ScanFormat.Bmp:
      return new BmpFormat();
    case ScanFormat.Ppm:
      return new PpmFormat();
    case ScanFormat.Raw:
      return new RawFormat();
  }
}
