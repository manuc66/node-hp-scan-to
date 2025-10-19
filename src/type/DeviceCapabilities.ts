import { IScanStatus } from "../hpModels/IScanStatus";
import { IScanJobSettings } from "../hpModels/IScanJobSettings";
import { InputSource } from "./InputSource";
import { ScanMode } from "./scanMode";

export interface DeviceCapabilities {
  supportsMultiItemScanFromPlaten: boolean;
  useWalkupScanToComp: boolean | undefined;
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
