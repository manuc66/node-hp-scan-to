import type { ScanConfig } from "../src/type/scanConfigs.js";
import { ScanMode } from "../src/type/scanMode.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import type { IScanStatus } from "../src/hpModels/IScanStatus.js";
import type { IScanJobSettings } from "../src/hpModels/IScanJobSettings.js";

import { ScanFormat } from "../src/type/scanFormat.js";

export function createDefaultScanConfig(): ScanConfig {
  return {
    resolution: 200,
    mode: ScanMode.Color,
    width: undefined,
    height: undefined,
    paperDim: undefined,
    paperSize: undefined,
    directoryConfig: {
      directory: undefined,
      tempDirectory: undefined,
      filePattern: undefined,
    },
    paperlessConfig: undefined,
    nextcloudConfig: undefined,
    preferEscl: false,
    paperOrientation: "portrait",
    format: ScanFormat.Jpeg,
  };
}

export function createDefaultDeviceCapabilities(): DeviceCapabilities {
  return {
    supportsMultiItemScanFromPlaten: false,
    useWalkupScanToComp: false,
    platenMaxWidth: null,
    platenMaxHeight: null,
    adfMaxWidth: null,
    adfMaxHeight: null,
    adfDuplexMaxWidth: null,
    adfDuplexMaxHeight: null,
    hasAdfDetectPaperLoaded: false,
    hasAdfDuplex: false,
    isEscl: false,
    getScanStatus: () => Promise.resolve({} as IScanStatus),
    createScanJobSettings: (..._args: unknown[]) => ({}) as IScanJobSettings,
    submitScanJob: () => Promise.resolve("fake-value"),
  };
}
