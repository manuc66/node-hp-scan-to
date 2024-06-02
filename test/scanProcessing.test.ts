import { describe } from "mocha";
import { expect } from "chai";
import {
  getScanWidth,
  getScanHeight,
  ScanConfig,
} from "../src/scanProcessing";
import { DeviceCapabilities } from "../src/DeviceCapabilities";
import { InputSource } from "../src/InputSource";

describe("scanProcessing", () => {
  let scanConfig: ScanConfig;
  let deviceCapabilities: DeviceCapabilities;

  beforeEach(async () => {
    scanConfig = {
      resolution: 200,
      width: null,
      height: null,
      directoryConfig: {
        directory: undefined,
        tempDirectory: undefined,
        filePattern: undefined,
      },
      paperlessConfig: undefined
    };
    deviceCapabilities = {
      supportsMultiItemScanFromPlaten: false,
      useWalkupScanToComp: false,
      platenMaxWidth: null,
      platenMaxHeight: null,
      adfMaxWidth: null,
      adfMaxHeight: null,
    };
  });

  describe("getScanWidth", async () => {
    const inputSource = InputSource.Adf;
    describe("Adf", async () => {
      it("Does not define a value if nothing provided", async () => {
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities);
        expect(width).to.be.eq(null);
      });
      it("Does not define a value if negative provided", async () => {
        scanConfig.width = -1;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities);
        expect(width).to.be.eq(null);
      });
      it("Define the value if no max available from device", async () => {
        scanConfig.width = 2583;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities);
        expect(width).to.be.eq(2583);
      });
    });
    describe("Platen", async () => {
      const inputSource = InputSource.Platen;
      it("Does not define a value if nothing provided", async () => {
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities);
        expect(width).to.be.eq(null);
      });
      it("Does not define a value if negative provided", async () => {
        scanConfig.width = -1;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities);
        expect(width).to.be.eq(null);
      });
      it("Define the value if no max available from device", async () => {
        scanConfig.width = 2583;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities);
        expect(width).to.be.eq(2583);
      });
    });
  });

  describe("getScanHeight", async () => {
    const inputSource = InputSource.Adf;
    describe("Adf", async () => {
      it("Does not define a value if nothing provided", async () => {
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities);
        expect(height).to.be.eq(null);
      });
      it("Does not define a value if negative provided", async () => {
        scanConfig.height = -1;
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities);
        expect(height).to.be.eq(null);
      });
      it("Define the value if no max available from device", async () => {
        scanConfig.height = 1269;
        const width = getScanHeight(scanConfig, inputSource, deviceCapabilities);
        expect(width).to.be.eq(1269);
      });
    });
    describe("Platen", async () => {
      const inputSource = InputSource.Platen;
      it("Does not define a value if nothing provided", async () => {
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities);
        expect(height).to.be.eq(null);
      });
      it("Does not define a value if negative provided", async () => {
        scanConfig.height = -1;
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities);
        expect(height).to.be.eq(null);
      });
      it("Define the value if no max available from device", async () => {
        scanConfig.height = 1269;
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities);
        expect(height).to.be.eq(1269);
      });
    });
  });
});
