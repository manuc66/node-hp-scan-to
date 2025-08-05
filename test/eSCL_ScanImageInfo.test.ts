import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import EsclScanImageInfo from "../src/hpModels/EsclScanImageInfo";

describe("EsclScanImageInfo", () => {
  describe("Parsing eSCL_ScanImageInfo.xml", async () => {
    let scanImageInfo: EsclScanImageInfo;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScanImageInfo.xml"),
        { encoding: "utf8" }, //
      );
      scanImageInfo = await EsclScanImageInfo.createScanImageInfo(content);
    });

    it("Parse ActualWidth", async () => {
      expect(scanImageInfo.actualWidth).to.be.eq(1700);
    });
    it("Parse ActualHeight", async () => {
      expect(scanImageInfo.actualHeight).to.be.eq(2420);
    });

    it("Parse JobUri", async () => {
      expect(scanImageInfo.jobURI).to.be.eq("/eSCL/ScanJobs/2");
    });
    it("Parse JobUuid", async () => {
      expect(scanImageInfo.jobUuid).to.be.eq("1876-0002");
    });
  });
});
