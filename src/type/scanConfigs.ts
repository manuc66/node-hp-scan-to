import type { DirectoryConfig } from "./directoryConfig.js";
import type { PaperlessConfig } from "../paperless/PaperlessConfig.js";
import type { NextcloudConfig } from "../nextcloud/NextcloudConfig.js";
import type { ScanMode } from "./scanMode.js";

export interface ScanConfig {
  resolution: number;
  mode: ScanMode;
  width: number | null;
  height: number | null;
  directoryConfig: DirectoryConfig;
  paperlessConfig: PaperlessConfig | undefined;
  nextcloudConfig: NextcloudConfig | undefined;
  preferEscl: boolean;
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
