import { describe, it } from "mocha";
import { expect } from "chai";
import { getScanWidth, getScanHeight } from "../src/scanProcessing.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import { InputSource } from "../src/type/InputSource.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import type { IScanJobSettings } from "../src/hpModels/IScanJobSettings.js";
import type { IScanStatus } from "../src/hpModels/IScanStatus.js";
import { ScanMode } from "../src/type/scanMode.js";

describe("scanProcessing - Paper Size Integration", () => {
  let scanConfig: ScanConfig;
  let deviceCapabilities: DeviceCapabilities;

  beforeEach(async () => {
    scanConfig = {
      resolution: 200,
      mode: ScanMode.Color,
      width: null,
      height: null,
      directoryConfig: {
        directory: undefined,
        tempDirectory: undefined,
        filePattern: undefined,
      },
      paperlessConfig: undefined,
      nextcloudConfig: undefined,
      preferEscl: false,
    };
    deviceCapabilities = {
      supportsMultiItemScanFromPlaten: false,
      useWalkupScanToComp: false,
      platenMaxWidth: 2550, // 8.5 inches at 300 DPI
      platenMaxHeight: 3300, // 11 inches at 300 DPI
      adfMaxWidth: 2550,
      adfMaxHeight: 3300,
      adfDuplexMaxWidth: 2550,
      adfDuplexMaxHeight: 3300,
      hasAdfDetectPaperLoaded: false,
      hasAdfDuplex: false,
      isEscl: false,
      getScanStatus: () => Promise.resolve({} as IScanStatus),
      createScanJobSettings: (_) => ({}) as IScanJobSettings,
      submitScanJob: () => Promise.resolve("fake-value"),
    };
  });

  describe("Paper Size Preset - A4", async () => {
    it("applies A4 paper size dimensions (210x297mm)", async () => {
      scanConfig.paperSize = "A4";
      // A4 = 210x297mm
      // At 200 DPI: 210mm = 1654px, 297mm = 2339px (approximately)
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(1654, 50);
      expect(height).to.be.approximately(2339, 50);
    });
  });

  describe("Paper Size Preset - Letter", async () => {
    it("applies Letter paper size dimensions (8.5x11 inches)", async () => {
      scanConfig.paperSize = "Letter";
      // Letter = 8.5x11 inches = 215.9x279.4mm
      // At 200 DPI: 8.5in = 1700px, 11in = 2200px
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(1700, 50);
      expect(height).to.be.approximately(2200, 50);
    });
  });

  describe("Paper Size Preset - A5", async () => {
    it("applies A5 paper size dimensions (148x210mm)", async () => {
      scanConfig.paperSize = "A5";
      // A5 = 148x210mm
      // At 200 DPI: 148mm = 1165px, 210mm = 1654px
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(1165, 50);
      expect(height).to.be.approximately(1654, 50);
    });
  });

  describe("Custom Paper Dimensions", async () => {
    it("applies custom dimensions in cm (21x29.7cm)", async () => {
      scanConfig.paperDim = "21x29.7cm";
      // 21x29.7cm = 210x297mm (same as A4)
      // At 200 DPI: 210mm = 1654px, 297mm = 2339px
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(1654, 50);
      expect(height).to.be.approximately(2339, 50);
    });

    it("applies custom dimensions in inches (8.5x11in)", async () => {
      scanConfig.paperDim = "8.5x11in";
      // 8.5x11 inches at 200 DPI: 1700x2200px
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(1700, 50);
      expect(height).to.be.approximately(2200, 50);
    });

    it("applies custom dimensions in mm (210x297mm)", async () => {
      scanConfig.paperDim = "210x297mm";
      // 210x297mm at 200 DPI: 1654x2339px
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(1654, 50);
      expect(height).to.be.approximately(2339, 50);
    });
  });

  describe("Paper Size Clamping", async () => {
    it("clamps paper size to device maximum width", async () => {
      scanConfig.paperSize = "A4";
      deviceCapabilities.platenMaxWidth = 1000; // Smaller than A4 width
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.equal(1000);
    });

    it("clamps paper size to device maximum height", async () => {
      scanConfig.paperSize = "A4";
      deviceCapabilities.platenMaxHeight = 2000; // Smaller than A4 height
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(height).to.equal(2000);
    });
  });

  describe("Paper Size with different resolutions", async () => {
    it("applies A4 at 300 DPI", async () => {
      scanConfig.paperSize = "A4";
      scanConfig.resolution = 300;
      // A4 at 300 DPI: 210mm = 2480px, 297mm = 3508px (height clamped to device max)
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.equal(deviceCapabilities.platenMaxHeight);
    });

    it("applies A4 at 100 DPI", async () => {
      scanConfig.paperSize = "A4";
      scanConfig.resolution = 100;
      // A4 at 100 DPI: 210mm = 827px, 297mm = 1169px
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(827, 50);
      expect(height).to.be.approximately(1169, 50);
    });
  });

  describe("Paper Size Priority", async () => {
    it("ignores both paperSize and paperDim if not set", async () => {
      delete scanConfig.paperSize;
      delete scanConfig.paperDim;
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      // Should return device max
      expect(width).to.equal(deviceCapabilities.platenMaxWidth);
      expect(height).to.equal(deviceCapabilities.platenMaxHeight);
    });
  });

  describe("Max Preset", async () => {
    it("uses device maximum when Max preset is specified", async () => {
      scanConfig.paperSize = "Max";
      const width = getScanWidth(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      const height = getScanHeight(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      // Max should use device capabilities
      expect(width).to.equal(deviceCapabilities.platenMaxWidth);
      expect(height).to.equal(deviceCapabilities.platenMaxHeight);
    });
  });
});
