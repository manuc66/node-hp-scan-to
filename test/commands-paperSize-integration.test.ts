import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import { getScanDimensions } from "../src/scanDimensions.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import type {
  ScanConfig,
  SingleScanConfig,
  AdfAutoScanConfig,
} from "../src/type/scanConfigs.js";
import { InputSource } from "../src/type/InputSource.js";
import type { IScanJobSettings } from "../src/hpModels/IScanJobSettings.js";
import type { IScanStatus } from "../src/hpModels/IScanStatus.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";

describe("Command Integration - Paper Size Configuration", () => {
  let baseDeviceCapabilities: DeviceCapabilities;

  beforeEach(() => {
    baseDeviceCapabilities = {
      supportsMultiItemScanFromPlaten: false,
      useWalkupScanToComp: false,
      platenMaxWidth: 2550,
      platenMaxHeight: 3300,
      adfMaxWidth: 2550,
      adfMaxHeight: 3300,
      adfDuplexMaxWidth: 2550,
      adfDuplexMaxHeight: 3300,
      hasAdfDetectPaperLoaded: false,
      hasAdfDuplex: false,
      isEscl: false,
      getScanStatus: () => Promise.resolve({} as IScanStatus),
      createScanJobSettings: (_) => ({}) as IScanJobSettings,
      submitScanJob: () => Promise.resolve("fake-job-id"),
    };
  });

  describe("Single Scan Command with Paper Size", () => {
    it("should configure A4 paper size for single scan", () => {
      const scanConfig: SingleScanConfig = {
        resolution: 200,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "A4",
        isDuplex: false,
        generatePdf: false,
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      // A4 at 300 DPI: 210mm/25.4 * 300 = 2480.3... pixels
      // 297mm/25.4 * 300 = 3507.8... pixels, clamped to 3300
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.be.approximately(3300, 50);
    });

    it("should configure custom dimensions for single scan", () => {
      const scanConfig: SingleScanConfig = {
        resolution: 300,
        mode: ScanMode.Gray,
        width: undefined,
        height: undefined,
        paperSize: undefined,
        paperOrientation: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperDim: "6x4in",
        isDuplex: false,
        generatePdf: false,
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      // 6x4 inches at 300 DPI: 1800 x 1200 pixels
      expect(width).to.be.approximately(1800, 50);
      expect(height).to.be.approximately(1200, 50);
    });

    it("should use device max when no paper size is specified", () => {
      const scanConfig: SingleScanConfig = {
        resolution: 200,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperSize: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        isDuplex: false,
        generatePdf: false,
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      expect(width).to.equal(baseDeviceCapabilities.platenMaxWidth);
      expect(height).to.equal(baseDeviceCapabilities.platenMaxHeight);
    });
  });

  describe("ADF Autoscan Command with Paper Size", () => {
    it("should configure Letter paper size for ADF scan", () => {
      const scanConfig: AdfAutoScanConfig = {
        resolution: 200,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "Letter",
        isDuplex: false,
        generatePdf: false,
        pollingInterval: 1000,
        startScanDelay: 0,
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Adf,
        baseDeviceCapabilities,
        false,
      );

      // Letter at 200 DPI: ~1700 x 2200 pixels
      expect(width).to.be.approximately(2550, 50);
      expect(height).to.be.approximately(3300, 50);
    });

    it("should configure A5 paper size for duplex ADF scan", () => {
      const scanConfig: AdfAutoScanConfig = {
        resolution: 300,
        mode: ScanMode.Gray,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "A5",
        isDuplex: true,
        generatePdf: false,
        pollingInterval: 1000,
        startScanDelay: 0,
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Adf,
        baseDeviceCapabilities,
        true,
      );

      // A5 at 300 DPI: ~1748 x 2480 pixels
      expect(width).to.be.approximately(1748, 50);
      expect(height).to.be.approximately(2480, 50);
    });

    it("should use ADF max dimensions when no paper size specified", () => {
      const scanConfig: AdfAutoScanConfig = {
        resolution: 200,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperSize: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        isDuplex: false,
        generatePdf: false,
        pollingInterval: 1000,
        startScanDelay: 0,
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Adf,
        baseDeviceCapabilities,
        false,
      );

      expect(width).to.equal(baseDeviceCapabilities.adfMaxWidth);
      expect(height).to.equal(baseDeviceCapabilities.adfMaxHeight);
    });
  });

  describe("Listen Command with Paper Size", () => {
    it("should configure Legal paper size for listen command", () => {
      const scanConfig: ScanConfig = {
        resolution: 150,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "Legal",
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      // Legal at 150 DPI: ~1275 x 2100 pixels
      expect(width).to.be.approximately(2550, 50);
      expect(height).to.be.approximately(3300, 50);
    });

    it("should handle B5 paper size", () => {
      const scanConfig: ScanConfig = {
        resolution: 200,
        mode: ScanMode.Gray,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "B5",
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      // B5 at 200 DPI: ~1386 x 1969 pixels
      expect(width).to.be.approximately(2079, 50);
      expect(height).to.be.approximately(2953, 50);
    });
  });

  describe("Paper Size with Device Limitations", () => {
    it("should clamp to device max when paper size exceeds capabilities", () => {
      // Create device with smaller max dimensions
      const smallDevice: DeviceCapabilities = {
        ...baseDeviceCapabilities,
        platenMaxWidth: 1000, // Smaller than A4 would require
        platenMaxHeight: 1500,
      };

      const scanConfig: ScanConfig = {
        resolution: 300,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "A4",
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        smallDevice,
        false,
      );

      // Should be clamped to device max
      expect(width).to.equal(1000);
      expect(height).to.equal(1500);
    });

    it("should handle Max preset by using device capabilities", () => {
      const scanConfig: ScanConfig = {
        resolution: 200,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "Max",
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      expect(width).to.equal(baseDeviceCapabilities.platenMaxWidth);
      expect(height).to.equal(baseDeviceCapabilities.platenMaxHeight);
    });
  });

  describe("Paper Size Overrides Manual Width/Height", () => {
    it("should override manual width/height when paper size is set", () => {
      const scanConfig: ScanConfig = {
        resolution: 200,
        mode: ScanMode.Color,
        width: 1000, // Manual width
        height: 1000, // Manual height
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "A4",
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      // Should use A4 dimensions at 300 DPI, not manual 1000x1000
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.be.approximately(3300, 50);
      expect(width).to.not.equal(1000);
      expect(height).to.not.equal(1000);
    });
  });

  describe("Different Resolution Settings", () => {
    it("should scale paper size correctly at 100 DPI", () => {
      const scanConfig: ScanConfig = {
        resolution: 100,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "Letter",
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      // Letter at 300 DPI: 8.5" * 300 = 2550, 11" * 300 = 3300
      expect(width).to.be.approximately(2550, 30);
      expect(height).to.be.approximately(3300, 30);
    });

    it("should scale paper size correctly at 600 DPI", () => {
      const scanConfig: ScanConfig = {
        resolution: 600,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        paperOrientation: undefined,
        paperDim: undefined,
        directoryConfig: {
          directory: undefined,
          tempDirectory: undefined,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        format: ScanFormat.Jpeg,
        paperSize: "A4",
      };

      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        baseDeviceCapabilities,
        false,
      );

      // A4 at 300 DPI (fixed)
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.be.approximately(3300, 50);
    });
  });
});
