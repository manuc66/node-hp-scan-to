import type { IScanStatus } from "../hpModels/IScanStatus.js";
import type { IScanJobSettings } from "../hpModels/IScanJobSettings.js";
import type { InputSource } from "./InputSource.js";
import type { ScanMode } from "./scanMode.js";
import type { ScanFormat } from "./scanFormat.js";

export interface DeviceCapabilities {
  supportsMultiItemScanFromPlaten: boolean;
  useWalkupScanToComp: boolean;
  platenMaxWidth: number | null;
  platenMaxHeight: number | null;
  adfMaxWidth: number | null;
  adfMaxHeight: number | null;
  adfDuplexMaxWidth: number | null;
  adfDuplexMaxHeight: number | null;
  hasAdfDuplex: boolean;
  hasAdfDetectPaperLoaded: boolean;
  isEscl: boolean;
  getScanStatus: () => Promise<IScanStatus>;
  createScanJobSettings: (
    inputSource: InputSource,
    contentType: "Document" | "Photo",
    format: ScanFormat,
    resolution: number,
    mode: ScanMode,
    width: number | null,
    height: number | null,
    isDuplex: boolean,
  ) => IScanJobSettings;
  submitScanJob: (scanJobSettings: IScanJobSettings) => Promise<string>;
}
