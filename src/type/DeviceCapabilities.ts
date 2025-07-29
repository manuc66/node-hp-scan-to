import { IScanStatus } from "../hpModels/IScanStatus";

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
  getScanStatus: () => Promise<IScanStatus>
}
