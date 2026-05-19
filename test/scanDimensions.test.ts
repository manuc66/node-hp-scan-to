import { describe, it } from "mocha";
import { expect } from "chai";
import { getScanDimensions } from "../src/scanDimensions.js";
import { InputSource } from "../src/type/InputSource.js";
import {
  createDefaultDeviceCapabilities,
  createDefaultScanConfig,
} from "./testUtils.js";

describe("scanDimensions", () => {
  describe("getScanDimensions", () => {
    const inputSource = InputSource.Adf;
    describe("Adf", () => {
      it("Does not define a value if nothing provided", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          false,
        );
        expect(width).to.be.eq(null);
        expect(height).to.be.eq(null);
      });

      it("Does not define a value if negative provided", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        scanConfig.width = -1;
        scanConfig.height = -1;
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          false,
        );
        expect(width).to.be.eq(null);
        expect(height).to.be.eq(null);
      });

      it("Define the value if no max available from device", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        scanConfig.width = 2583;
        scanConfig.height = 1269;
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          false,
        );
        expect(width).to.be.eq(2583 * 300);
        expect(height).to.be.eq(1269 * 300);
      });

      it("Limits the value if available from device", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        scanConfig.width = 2583;
        scanConfig.height = 1269;
        deviceCapabilities.adfMaxWidth = 1000;
        deviceCapabilities.adfMaxHeight = 1100;
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          false,
        );
        expect(width).to.be.eq(1000);
        expect(height).to.be.eq(1100);
      });

      it("Uses the max value if available from device", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        deviceCapabilities.adfMaxWidth = 1000;
        deviceCapabilities.adfMaxHeight = 1100;
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          false,
        );
        expect(width).to.be.eq(1000);
        expect(height).to.be.eq(1100);
      });

      it("Uses the duplexer value if available from device", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        deviceCapabilities.adfMaxWidth = 1000;
        deviceCapabilities.adfMaxHeight = 1100;
        deviceCapabilities.adfDuplexMaxWidth = 2000;
        deviceCapabilities.adfDuplexMaxHeight = 2100;
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          true,
        );
        expect(width).to.be.eq(2000);
        expect(height).to.be.eq(2100);
      });
    });

    describe("Platen", () => {
      const inputSource = InputSource.Platen;
      it("Does not define a value if nothing provided", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          false,
        );
        expect(width).to.be.eq(null);
        expect(height).to.be.eq(null);
      });

      it("Does not define a value if negative provided", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        scanConfig.width = -1;
        scanConfig.height = -1;
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          false,
        );
        expect(width).to.be.eq(null);
        expect(height).to.be.eq(null);
      });

      it("Define the value if no max available from device", () => {
        const scanConfig = createDefaultScanConfig();
        const deviceCapabilities = createDefaultDeviceCapabilities();
        scanConfig.width = 2583;
        scanConfig.height = 1269;
        const { width, height } = getScanDimensions(
          scanConfig,
          inputSource,
          deviceCapabilities,
          false,
        );
        expect(width).to.be.eq(2583 * 300);
        expect(height).to.be.eq(1269 * 300);
      });
    });
  });
});
