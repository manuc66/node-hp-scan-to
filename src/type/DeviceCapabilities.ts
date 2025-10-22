import { IScanStatus } from "../hpModels/IScanStatus.js";
import { IScanJobSettings } from "../hpModels/IScanJobSettings.js";
import { InputSource } from "./InputSource.js";
import { ScanMode } from "./scanMode.js";

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
    resolution: number,
    mode: ScanMode,
    width: number | null,
    height: number | null,
    isDuplex: boolean,
  ) => IScanJobSettings;
  submitScanJob: (scanJobSettings: IScanJobSettings) => Promise<string>;
}
