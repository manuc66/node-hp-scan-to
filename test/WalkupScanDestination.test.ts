import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import WalkupScanDestination from "../src/WalkupScanDestination";

describe("WalkupScanDestination", () => {
  describe("Parsing walkupScanToCompDestination_with_ScanPlexMode.xml", async () => {
    let destination: WalkupScanDestination;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/walkupScanDestination_with_ScanPlexMode.xml"
        ),
        { encoding: "utf8" }
      );
      destination = await WalkupScanDestination.createWalkupScanDestination(content);
    });

    it("Parse scanPlexMode", async () => {
      expect(destination.scanPlexMode).to.be.eq("Simplex");
    });

    it("Parse shortcut", async () => {
      expect(destination.shortcut).to.be.eq("SavePDF");
    });

    it("Parse resourceURI", async () => {
      expect(destination.resourceURI).to.be.eq(
        "http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113"
      );
    });

    it("Parse hostname", async () => {
      expect(destination.hostname).to.be.eq("LAPTOP-BSHRTBV8");
    });

    it("Parse name", async () => {
      expect(destination.name).to.be.eq("LAPTOP-BSHRTBV8");
    });
  });
  describe("Parsing walkupScanDestination_with_shortcut_SaveDocument1.xml", async () => {
    let destination: WalkupScanDestination;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/walkupScanDestination_with_shortcut_SaveDocument1.xml"
        ),
        { encoding: "utf8" }
      );
      destination = await WalkupScanDestination.createWalkupScanDestination(content);
    });

    it("Parse scanPlexMode", async () => {
      expect(destination.scanPlexMode).to.be.eq("Simplex");
    });

    it("Parse shortcut", async () => {
      expect(destination.shortcut).to.be.eq("SaveDocument1");
    });

    it("Parse resourceURI", async () => {
      expect(destination.resourceURI).to.be.eq(
        "http://192.168.5.221:80/WalkupScan/WalkupScanDestinations/1c8530e5-b81c-1f08-8d61-984be142325d"
      );
    });

    it("Parse hostname", async () => {
      expect(destination.hostname).to.be.eq("scan");
    });

    it("Parse name", async () => {
      expect(destination.name).to.be.eq("scan");
    });
  });
});
