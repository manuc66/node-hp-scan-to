import type DeviceClient from "../DeviceClient.js";
import type { IScanStatus } from "../hpModels/IScanStatus.js";
import type { IScanJobSettings } from "../hpModels/IScanJobSettings.js";
import type { InputSource } from "./InputSource.js";
import type { ScanMode } from "./scanMode.js";
import type { ImageFormat } from "../imageFormats/index.js";
import type { RegistrationConfig } from "./scanTargetDefinitions.js";
import type { ScanListener } from "../scanListeners/ScanListener.js";

/**
 * Builds the walkup listener for the protocol detected on the device.
 * `null` means the device cannot notify this host of a panel-triggered scan.
 */
export type WalkupScanListenerFactory = (
  api: DeviceClient,
  registrationConfigs: RegistrationConfig[],
) => ScanListener;

export interface DeviceCapabilities {
  supportsMultiItemScanFromPlaten: boolean;
  /**
   * Protocol-specific listener construction, resolved while reading the
   * device capabilities. `null` when walkup is not available.
   */
  createWalkupScanListener: WalkupScanListenerFactory | null;
  platenMaxWidth: number | null;
  platenMaxHeight: number | null;
  adfMaxWidth: number | null;
  adfMaxHeight: number | null;
  adfDuplexMaxWidth: number | null;
  adfDuplexMaxHeight: number | null;
  hasAdfDuplex: boolean;
  hasAdfDetectPaperLoaded: boolean;
  userActionTimeout: number | null;
  isEscl: boolean;
  getScanStatus: () => Promise<IScanStatus>;
  createScanJobSettings: (
    inputSource: InputSource,
    contentType: "Document" | "Photo",
    format: ImageFormat,
    resolution: number,
    mode: ScanMode,
    width: number | null,
    height: number | null,
    isDuplex: boolean,
    contextID?: string,
  ) => IScanJobSettings;
  submitScanJob: (scanJobSettings: IScanJobSettings) => Promise<string>;
}
