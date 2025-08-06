import { DirectoryConfig } from "./directoryConfig";
import { PaperlessConfig } from "../paperless/PaperlessConfig";
import { NextcloudConfig } from "../nextcloud/NextcloudConfig";
import { ScanMode } from "./scanMode";

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
