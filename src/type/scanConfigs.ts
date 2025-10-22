import { DirectoryConfig } from "./directoryConfig.js";
import { PaperlessConfig } from "../paperless/PaperlessConfig.js";
import { NextcloudConfig } from "../nextcloud/NextcloudConfig.js";
import { ScanMode } from "./scanMode.js";

export type ScanConfig = {
  resolution: number;
  mode: ScanMode;
  width: number | null;
  height: number | null;
  directoryConfig: DirectoryConfig;
  paperlessConfig: PaperlessConfig | undefined;
  nextcloudConfig: NextcloudConfig | undefined;
  preferEscl: boolean;
};
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
