import { copyFile } from "node:fs/promises";
import { buildSavedImage, type DownloadMeta, type ImageFormat, type SavedImage } from "./index.js";
import type { ScanMode } from "../type/scanMode.js";
import { DeviceFormat } from "../hpModels/ScanJobSettings.js";
import { DocumentFormatExt } from "../hpModels/EsclScanJobSettings.js";

export class RawFormat implements ImageFormat {
  getExtension() {
    return "bin";
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

