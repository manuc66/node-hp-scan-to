import {
  buildSavedImage,
  type DownloadMeta,
  type ImageFormat,
  type SavedImage,
} from "./index.js";
import type { ScanMode } from "../type/scanMode.js";
import { copyFile } from "node:fs/promises";
import { DeviceFormat } from "../hpModels/ScanJobSettings.js";
import { DocumentFormatExt } from "../hpModels/EsclScanJobSettings.js";

export class JpegFormat implements ImageFormat {
  getExtension() {
    return "jpg";
  }

  getDeviceFormat(): DeviceFormat {
    return DeviceFormat.Jpeg;
  }

  getDocumentFormatExt(): DocumentFormatExt {
    return DocumentFormatExt.Jpeg;
  }

  isJpeg() {
    return true;
  }

  async save(
    downloadMeta: DownloadMeta,
    imageWidth: number,
    imageHeight: number,
    xResolution: number,
    _mode: ScanMode,
    destinationFilePath: string,
  ): Promise<SavedImage> {
    await copyFile(downloadMeta.path, destinationFilePath);

    return buildSavedImage(
      destinationFilePath,
      imageWidth,
      imageHeight,
      xResolution,
    );
  }
}
