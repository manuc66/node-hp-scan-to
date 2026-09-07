import { describe, it } from "mocha";
import { expect } from "chai";
import { saveScanFromEvent, singleScan } from "../src/scanProcessing.js";
import type DeviceClient from "../src/DeviceClient.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import type { IScanStatus } from "../src/hpModels/IScanStatus.js";
import { ScannerState } from "../src/hpModels/ScannerState.js";
import { AdfState } from "../src/hpModels/AdfState.js";
import { InputSource } from "../src/type/InputSource.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";
import type { ScanConfig, SingleScanConfig } from "../src/type/scanConfigs.js";
import type { SelectedScanTarget } from "../src/type/scanTargetDefinitions.js";

function notIdleStatus(): IScanStatus {
  return {
    scannerState: ScannerState.Processing,
    adfState: AdfState.Empty,
    isLoaded: () => false,
    getInputSource: () => InputSource.Platen,
  };
}

function makeDeviceCapabilities(): DeviceCapabilities {
  return {
    supportsMultiItemScanFromPlaten: false,
    useWalkupScanToComp: false,
    platenMaxWidth: null,
    platenMaxHeight: null,
    adfMaxWidth: null,
    adfMaxHeight: null,
    adfDuplexMaxWidth: null,
    adfDuplexMaxHeight: null,
    hasAdfDuplex: false,
    hasAdfDetectPaperLoaded: false,
    userActionTimeout: null,
    isEscl: false,
    getScanStatus: async () => notIdleStatus(),
    createScanJobSettings: () => {
      throw new Error(
        "createScanJobSettings should not be called when scanner is not Idle",
      );
    },
    submitScanJob: async () => {
      throw new Error(
        "submitScanJob should not be called when scanner is not Idle",
      );
    },
  };
}

const scanConfig: ScanConfig = {
  resolution: 200,
  mode: ScanMode.Color,
  width: undefined,
  height: undefined,
  format: ScanFormat.Jpeg,
  directoryConfig: {
    directory: "/tmp",
    tempDirectory: "/tmp",
    filePattern: undefined,
  },
  paperlessConfig: undefined,
  nextcloudConfig: undefined,
  s3Config: undefined,
  webhookConfig: undefined,
  preferEscl: false,
  paperSize: undefined,
  paperDim: undefined,
  paperOrientation: undefined,
};

describe("scanProcessing", () => {
  describe("saveScanFromEvent", () => {
    it("aborts and returns empty content when the scanner is not Idle (regression: the pino branch only logged and continued)", async () => {
      const api = {} as DeviceClient;
      const selectedScanTarget = {} as SelectedScanTarget;

      const content = await saveScanFromEvent(
        api,
        selectedScanTarget,
        "/tmp",
        "/tmp",
        1,
        makeDeviceCapabilities(),
        scanConfig,
        false,
        true,
        PageCountingStrategy.Normal,
      );

      expect(content.elements).to.be.empty;
    });
  });

  describe("singleScan", () => {
    it("aborts when the scanner is not Idle (regression: the pino branch only logged and continued)", async () => {
      const api = {} as DeviceClient;
      const singleScanConfig: SingleScanConfig = {
        ...scanConfig,
        isDuplex: false,
        generatePdf: true,
      };

      await singleScan(
        api,
        1,
        "/tmp",
        "/tmp",
        singleScanConfig,
        makeDeviceCapabilities(),
        new Date(),
      );
    });
  });
});
