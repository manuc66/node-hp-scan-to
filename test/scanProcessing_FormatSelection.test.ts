import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import {
  singleScan,
  scanFromAdf,
  saveScanFromEvent,
} from "../src/scanProcessing.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import {
  createDefaultScanConfig,
  createDefaultDeviceCapabilities,
} from "./testUtils.js";
import type {
  AdfAutoScanConfig,
  SingleScanConfig,
} from "../src/type/scanConfigs.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";
import nock from "nock";
import DeviceClient from "../src/DeviceClient.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import { ScannerState } from "../src/hpModels/ScannerState.js";
import { AdfState } from "../src/hpModels/AdfState.js";
import { InputSource } from "../src/type/InputSource.js";
import type { IScanJobSettings } from "../src/hpModels/IScanJobSettings.js";
import type { ScanMode } from "../src/type/scanMode.js";

import type { IEvent } from "../src/hpModels/Event.js";
import type { ImageFormat } from "../src/imageFormats/index.js";

describe("scanProcessing Format Selection", () => {
  const folder = "/tmp/folder";
  const tempFolder = "/tmp/temp";
  const scanCount = 1;
  const date = new Date();

  const mockEvent: IEvent = {
    unqualifiedEventCategory: "ScanEvent",
    agingStamp: "1",
    destinationURI: "/test",
    compEventURI: "/test",
    isScanEvent: true,
  };

  let api: DeviceClient;

  beforeEach(() => {
    api = new DeviceClient("127.0.0.1");
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("singleScan forces Jpeg when PDF is requested and format is Bmp", async () => {
    const scanConfig: SingleScanConfig = {
      ...createDefaultScanConfig(),
      format: ScanFormat.Bmp,
      generatePdf: true,
      isDuplex: false,
    };

    let capturedFormat: ImageFormat | undefined;
    const deviceCapabilities: DeviceCapabilities = {
      ...createDefaultDeviceCapabilities(),
      getScanStatus: async () => {
        return {
          scannerState: ScannerState.Idle,
          adfState: AdfState.Empty,
          getInputSource: () => InputSource.Platen,
          isLoaded: () => false,
        };
      },
      createScanJobSettings: (
        _inputSource: InputSource,
        _contentType: "Document" | "Photo",
        format: ImageFormat,
        _resolution: number,
        _mode: ScanMode,
        _width: number | null,
        _height: number | null,
        _isDuplex: boolean,
      ) => {
        capturedFormat = format;
        return {
          toXML: async () => "<xml/>",
          format: format,
          xResolution: 300,
          yResolution: 300,
          mode: "Color",
        } as unknown as IScanJobSettings;
      },
    };

    // We expect an error later in executeScanJob because we didn't mock everything,
    // but we only care about capturedFormat.
    try {
      await singleScan(
        api,
        scanCount,
        folder,
        tempFolder,
        scanConfig,
        deviceCapabilities,
        date,
      );
    } catch {
      // ignore
    }

    expect(capturedFormat?.getDeviceFormat()).to.equal(ScanFormat.Jpeg);
  });

  it("scanFromAdf forces Jpeg when PDF is requested and format is Bmp", async () => {
    const scanConfig: AdfAutoScanConfig = {
      ...createDefaultScanConfig(),
      format: ScanFormat.Bmp,
      generatePdf: true,
      isDuplex: false,
      pollingInterval: 1000,
      startScanDelay: 0,
    };

    let capturedFormat: ImageFormat | undefined;
    const deviceCapabilities: DeviceCapabilities = {
      ...createDefaultDeviceCapabilities(),
      getScanStatus: async () => {
        return {
          scannerState: ScannerState.Idle,
          adfState: AdfState.Empty,
          getInputSource: () => InputSource.Platen,
          isLoaded: () => false,
        };
      },
      createScanJobSettings: (
        _inputSource: InputSource,
        _contentType: "Document" | "Photo",
        format: ImageFormat,
        _resolution: number,
        _mode: ScanMode,
        _width: number | null,
        _height: number | null,
        _isDuplex: boolean,
      ) => {
        capturedFormat = format;
        return {
          toXML: async () => "<xml/>",
          format: format,
          xResolution: 300,
          yResolution: 300,
          mode: "Color",
        } as unknown as IScanJobSettings;
      },
    };

    try {
      await scanFromAdf(
        api,
        scanCount,
        folder,
        tempFolder,
        scanConfig,
        deviceCapabilities,
        date,
      );
    } catch {
      // ignore
    }

    expect(capturedFormat?.getDeviceFormat()).to.equal(ScanFormat.Jpeg);
  });

  it("saveScanFromEvent forces Jpeg when isPdf is true and format is Bmp", async () => {
    const scanConfig = {
      ...createDefaultScanConfig(),
      format: ScanFormat.Bmp,
    };

    let capturedFormat: ImageFormat | undefined;
    const deviceCapabilities: DeviceCapabilities = {
      ...createDefaultDeviceCapabilities(),
      getScanStatus: async () => {
        return {
          scannerState: ScannerState.Idle,
          adfState: AdfState.Empty,
          getInputSource: () => InputSource.Platen,
          isLoaded: () => false,
        };
      },
      createScanJobSettings: (
        _inputSource: InputSource,
        _contentType: "Document" | "Photo",
        format: ImageFormat,
        _resolution: number,
        _mode: ScanMode,
        _width: number | null,
        _height: number | null,
        _isDuplex: boolean,
      ) => {
        capturedFormat = format;
        return {
          toXML: async () => "<xml/>",
          format: format,
          xResolution: 300,
          yResolution: 300,
          mode: "Color",
        } as unknown as IScanJobSettings;
      },
    };

    try {
      await saveScanFromEvent(
        api,
        {
          event: mockEvent,
          label: "test",
          resourceURI: "/test",
          isDuplexSingleSide: false,
        },
        folder,
        tempFolder,
        scanCount,
        deviceCapabilities,
        scanConfig,
        false,
        true, // isPdf = true
        PageCountingStrategy.Normal,
      );
    } catch {
      // ignore
    }

    expect(capturedFormat?.getDeviceFormat()).to.equal(ScanFormat.Jpeg);
  });
});
