import { describe } from "mocha";
import { expect } from "chai";
import {
  getScanWidth,
  getScanHeight,
} from "../src/scanProcessing";
import { DeviceCapabilities } from "../src/type/DeviceCapabilities";
import { InputSource } from "../src/type/InputSource";
import { ScanConfig } from "../src/type/scanConfigs";

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
      paperlessConfig: undefined,
      nextcloudConfig: undefined
    };
    deviceCapabilities = {
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
    };
  });

  describe("getScanWidth", async () => {
    const inputSource = InputSource.Adf;
    describe("Adf", async () => {
      it("Does not define a value if nothing provided", async () => {
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(null);
      });
      it("Does not define a value if negative provided", async () => {
        scanConfig.width = -1;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(null);
      });
      it("Define the value if no max available from device", async () => {
        scanConfig.width = 2583;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(2583);
      });
      it("Limits the value if available from device", async () => {
        scanConfig.width = 2583;
        deviceCapabilities.adfMaxWidth = 1000;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(1000);
      });
      it("Uses the max value if available from device", async () => {
        deviceCapabilities.adfMaxWidth = 1000;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(1000);
      });
      it("Uses the duplexer value if available from device", async () => {
        deviceCapabilities.adfMaxWidth = 1000;
        deviceCapabilities.adfDuplexMaxWidth = 2000;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, true);
        expect(width).to.be.eq(2000);
      });
    });
    describe("Platen", async () => {
      const inputSource = InputSource.Platen;
      it("Does not define a value if nothing provided", async () => {
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(null);
      });
      it("Does not define a value if negative provided", async () => {
        scanConfig.width = -1;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(null);
      });
      it("Define the value if no max available from device", async () => {
        scanConfig.width = 2583;
        const width = getScanWidth(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(2583);
      });
    });
  });

  describe("getScanHeight", async () => {
    const inputSource = InputSource.Adf;
    describe("Adf", async () => {
      it("Does not define a value if nothing provided", async () => {
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities, false);
        expect(height).to.be.eq(null);
      });
      it("Does not define a value if negative provided", async () => {
        scanConfig.height = -1;
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities, false);
        expect(height).to.be.eq(null);
      });
      it("Define the value if no max available from device", async () => {
        scanConfig.height = 1269;
        const width = getScanHeight(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(1269);
      });
      it("Limits the value if available from device", async () => {
        scanConfig.height = 1269;
        deviceCapabilities.adfMaxHeight = 1000;
        const width = getScanHeight(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(1000);
      });
      it("Uses the max value if available from device", async () => {
        deviceCapabilities.adfMaxHeight = 1000;
        const width = getScanHeight(scanConfig, inputSource, deviceCapabilities, false);
        expect(width).to.be.eq(1000);
      });
      it("Uses the duplexer value if available from device", async () => {
        deviceCapabilities.adfMaxHeight = 1000;
        deviceCapabilities.adfDuplexMaxHeight = 2000;
        const width = getScanHeight(scanConfig, inputSource, deviceCapabilities, true);
        expect(width).to.be.eq(2000);
      });
    });
    describe("Platen", async () => {
      const inputSource = InputSource.Platen;
      it("Does not define a value if nothing provided", async () => {
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities, false);
        expect(height).to.be.eq(null);
      });
      it("Does not define a value if negative provided", async () => {
        scanConfig.height = -1;
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities, false);
        expect(height).to.be.eq(null);
      });
      it("Define the value if no max available from device", async () => {
        scanConfig.height = 1269;
        const height = getScanHeight(scanConfig, inputSource, deviceCapabilities, false);
        expect(height).to.be.eq(1269);
      });
    });
  });
});
