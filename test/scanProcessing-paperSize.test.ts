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
    };
    deviceCapabilities = {
      supportsMultiItemScanFromPlaten: false,
      useWalkupScanToComp: false,
      platenMaxWidth: 2550, // 8.5 inches at 300 DPI
      platenMaxHeight: 4000, // Large enough for A4 (3508)
      adfMaxWidth: 2550,
      adfMaxHeight: 4000,
      adfDuplexMaxWidth: 2550,
      adfDuplexMaxHeight: 4000,
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
      // At 300 DPI (eSCL unit resolution): 210mm = 2480 units, 297mm = 3508 units
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
      expect(height).to.be.approximately(3508, 50);
    });
  });

  describe("Paper Size Preset - Letter", async () => {
    it("applies Letter paper size dimensions (8.5x11 inches)", async () => {
      scanConfig.paperSize = "Letter";
      // Letter = 8.5x11 inches = 215.9x279.4mm
      // At 300 DPI (eSCL unit resolution): 8.5" = 2550 units, 11" = 3300 units
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
      expect(width).to.be.approximately(2550, 50);
      expect(height).to.be.approximately(3300, 50);
    });
  });

  describe("Paper Size Preset - A5", async () => {
    it("applies A5 paper size dimensions (148x210mm)", async () => {
      scanConfig.paperSize = "A5";
      // A5 = 148x210mm
      // At 300 DPI (eSCL unit resolution): 148mm = 1748 units, 210mm = 2480 units
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
      expect(width).to.be.approximately(1748, 50);
      expect(height).to.be.approximately(2480, 50);
    });
  });

  describe("Custom Paper Dimensions", async () => {
    it("applies custom dimensions in cm (21x29.7cm)", async () => {
      scanConfig.paperDim = "21x29.7cm";
      // 21x29.7cm = 210x297mm (same as A4)
      // At 300 DPI (eSCL unit resolution): 210mm = 2480 units, 297mm = 3508 units
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
      expect(height).to.be.approximately(3508, 50);
    });

    it("applies custom dimensions in inches (8.5x11in)", async () => {
      scanConfig.paperDim = "8.5x11in";
      // 8.5x11 inches at 300 DPI (eSCL unit resolution): 2550x3300 units
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
      expect(width).to.be.approximately(2550, 50);
      expect(height).to.be.approximately(3300, 50);
    });

    it("applies custom dimensions in mm (210x297mm)", async () => {
      scanConfig.paperDim = "210x297mm";
      // 210x297mm = 2480x3508 units at 300 DPI
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
      expect(height).to.be.approximately(3508, 50);
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
      deviceCapabilities.platenMaxHeight = 3300;
      // A4 at 300 DPI: 210mm = 2480px, 297mm = 3508px (height clamped to 3300)
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
      expect(height).to.equal(3300);
    });

    it("applies A4 at 100 DPI", async () => {
      scanConfig.paperSize = "A4";
      scanConfig.resolution = 100;
      // A4 at 300 DPI (eSCL unit resolution): 210mm = 2480 units, 297mm = 3508 units
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
      expect(height).to.be.approximately(3508, 50);
    });
  });

  describe("eSCL Paper Size Units", async () => {
    it("uses 1/300in units regardless of requested DPI", async () => {
      scanConfig.paperSize = "A4";
      scanConfig.resolution = 200;
      deviceCapabilities.isEscl = true;
      deviceCapabilities.platenMaxHeight = 3300;
      // A4 in 1/300in units: ~2480x3508, height clamped to 3300
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
      expect(width).to.be.approximately(2480, 10);
      expect(height).to.equal(3300);
    });

    it("applies Letter in 1/300in units", async () => {
      scanConfig.paperSize = "Letter";
      scanConfig.resolution = 200;
      deviceCapabilities.isEscl = true;
      // Letter: 8.5x11in -> 2550x3300 in 1/300in units
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
      expect(width).to.equal(2550);
      expect(height).to.equal(3300);
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
