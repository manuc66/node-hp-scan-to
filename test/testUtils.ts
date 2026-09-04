import type { ScanConfig } from "../src/type/scanConfigs.js";
import { ScanMode } from "../src/type/scanMode.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import type { IScanStatus } from "../src/hpModels/IScanStatus.js";
import type { IScanJobSettings } from "../src/hpModels/IScanJobSettings.js";
import type { ScanMetadata } from "../src/type/ScanMetadata.js";
import { InputSource } from "../src/type/InputSource.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";

import { ScanFormat } from "../src/type/scanFormat.js";

export function buildScanMetadata(overrides?: {
  startedAt?: Date;
}): ScanMetadata {
  const startedAt = overrides?.startedAt ?? new Date();
  return {
    command: "single-scan",
    scanCount: 1,
    device: { ip: "127.0.0.1", isEscl: false },
    target: undefined,
    settings: {
      inputSource: InputSource.Adf,
      contentType: "Document",
      format: "jpg",
      sourceFormat: "jpg",
      mode: ScanMode.Gray,
      colorDepth: 8,
      channels: 1,
      resolution: 200,
      width: null,
      height: null,
      isDuplex: false,
      pageCountingStrategy: PageCountingStrategy.Normal,
      filePattern: undefined,
      paperSize: undefined,
      paperDim: undefined,
      paperOrientation: undefined,
    },
    startedAt: startedAt.toISOString(),
    instance: {
      id: "test-instance",
      startedAt: startedAt.toISOString(),
      uptimeMs: 0,
    },
  };
}

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
    s3Config: undefined,
    webhookConfig: undefined,
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
    userActionTimeout: null,
    isEscl: false,
    getScanStatus: () => Promise.resolve({} as IScanStatus),
    createScanJobSettings: (..._args: unknown[]) => ({}) as IScanJobSettings,
    submitScanJob: () => Promise.resolve("fake-value"),
  };
}
