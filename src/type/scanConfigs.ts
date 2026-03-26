import type { DirectoryConfig } from "./directoryConfig.js";
import type { PaperlessConfig } from "../paperless/PaperlessConfig.js";
import type { NextcloudConfig } from "../nextcloud/NextcloudConfig.js";
import type { ScanMode } from "./scanMode.js";
import type { ScanFormat } from "./scanFormat.js";

export interface ScanConfig {
  resolution: number;
  mode: ScanMode;
  width: number | "max" | undefined;
  height: number | "max" | undefined;
  format: ScanFormat;
  directoryConfig: DirectoryConfig;
  paperlessConfig: PaperlessConfig | undefined;
  nextcloudConfig: NextcloudConfig | undefined;
  preferEscl: boolean;
  paperSize: string | undefined; // e.g., "A4", "Letter", "Max", or preset name
  paperDim: string | undefined; // e.g., "21x29.7cm", "8.5x11in", "210x297mm"
  paperOrientation: "portrait" | "landscape" | undefined;
}
export type AdfAutoScanConfig = ScanConfig & {
  isDuplex: boolean;
  generatePdf: boolean;
  pollingInterval: number;
  startScanDelay: number;
};

export type SingleScanConfig = ScanConfig & {
  isDuplex: boolean;
  generatePdf: boolean;
};
