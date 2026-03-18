import { describe, it } from "mocha";
import { expect } from "chai";
import { getScanDimensions } from "../src/scanDimensions.js";
import { InputSource } from "../src/type/InputSource.js";
import {
  createDefaultDeviceCapabilities,
  createDefaultScanConfig,
} from "./testUtils.js";

describe("scanDimensions - Paper Size Integration", () => {
  describe("Paper Size Preset - A4", () => {
    it("applies A4 paper size dimensions (210x297mm)", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;

      scanConfig.paperSize = "A4";
      // A4 = 210x297mm
      // At 300 DPI (eSCL unit resolution): 210mm = 2480 units, 297mm = 3508 units
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.be.approximately(3508, 50);
    });
  });

  describe("Paper Size Preset - Letter", () => {
    it("applies Letter paper size dimensions (8.5x11 inches)", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;

      scanConfig.paperSize = "Letter";
      // Letter = 8.5x11 inches = 215.9x279.4mm
      // At 300 DPI (eSCL unit resolution): 8.5" = 2550 units, 11" = 3300 units
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2550, 50);
      expect(height).to.be.approximately(3300, 50);
    });
  });

  describe("Paper Size Preset - A5", () => {
    it("applies A5 paper size dimensions (148x210mm)", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;

      scanConfig.paperSize = "A5";
      // A5 = 148x210mm
      // At 300 DPI (eSCL unit resolution): 148mm = 1748 units, 210mm = 2480 units
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(1748, 50);
      expect(height).to.be.approximately(2480, 50);
    });
  });

  describe("Custom Paper Dimensions", () => {
    it("applies custom dimensions in cm (21x29.7cm)", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;

      scanConfig.paperDim = "21x29.7cm";
      // 21x29.7cm = 210x297mm (same as A4)
      // At 300 DPI (eSCL unit resolution): 210mm = 2480 units, 297mm = 3508 units
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.be.approximately(3508, 50);
    });

    it("applies custom dimensions in inches (8.5x11in)", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;

      scanConfig.paperDim = "8.5x11in";
      // 8.5x11 inches at 300 DPI (eSCL unit resolution): 2550x3300 units
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2550, 50);
      expect(height).to.be.approximately(3300, 50);
    });

    it("applies custom dimensions in mm (210x297mm)", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;

      scanConfig.paperDim = "210x297mm";
      // 210x297mm = 2480x3508 units at 300 DPI
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.be.approximately(3508, 50);
    });
  });

  describe("Paper Size Clamping", () => {
    it("clamps paper size to device maximum dimensions", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();

      scanConfig.paperSize = "A4";
      deviceCapabilities.platenMaxWidth = 1000;
      deviceCapabilities.platenMaxHeight = 2000;
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.equal(1000);
      expect(height).to.equal(2000);
    });
  });

  describe("Paper Size with different resolutions", () => {
    it("applies A4 at 300 DPI", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 3300;

      scanConfig.paperSize = "A4";
      scanConfig.resolution = 300;
      // A4 at 300 DPI: 210mm = 2480px, 297mm = 3508px (height clamped to 3300)
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.equal(3300);
    });

    it("applies A4 at 100 DPI", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;

      scanConfig.paperSize = "A4";
      scanConfig.resolution = 100;
      // A4 at 300 DPI (eSCL unit resolution): 210mm = 2480 units, 297mm = 3508 units
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2480, 50);
      expect(height).to.be.approximately(3508, 50);
    });
  });

  describe("eSCL Paper Size Units", () => {
    it("uses 1/300in units regardless of requested DPI", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 3300;
      deviceCapabilities.isEscl = true;

      scanConfig.paperSize = "A4";
      scanConfig.resolution = 200;
      // A4 in 1/300in units: ~2480x3508, height clamped to 3300
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.be.approximately(2480, 10);
      expect(height).to.equal(3300);
    });

    it("applies Letter in 1/300in units", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;
      deviceCapabilities.isEscl = true;

      scanConfig.paperSize = "Letter";
      scanConfig.resolution = 200;
      // Letter: 8.5x11in -> 2550x3300 in 1/300in units
      const { width, height } = getScanDimensions(
        scanConfig,
        InputSource.Platen,
        deviceCapabilities,
        false,
      );
      expect(width).to.equal(2550);
      expect(height).to.equal(3300);
    });
  });

  describe("Max Preset", () => {
    it("uses device maximum when Max preset is specified", () => {
      const scanConfig = createDefaultScanConfig();
      const deviceCapabilities = createDefaultDeviceCapabilities();
      deviceCapabilities.platenMaxWidth = 2550;
      deviceCapabilities.platenMaxHeight = 4000;

      scanConfig.paperSize = "Max";
      const { width, height } = getScanDimensions(
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
