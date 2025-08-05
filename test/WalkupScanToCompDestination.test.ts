import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import WalkupScanToCompDestination from "../src/hpModels/WalkupScanToCompDestination";
import { ScanPlexMode } from "../src/hpModels/ScanPlexMode";

describe("WalkupScanToCompDestination", () => {
  describe("Parsing walkupScanToCompDestination_with_ScanPlexMode.xml", async () => {
    let destination: WalkupScanToCompDestination;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/walkupScanToCompDestination_with_ScanPlexMode.xml"
        ),
        { encoding: "utf8" }
      );
      destination = await WalkupScanToCompDestination.createWalkupScanToCompDestination(content);
    });

    it("Parse scanPlexMode", async () => {
      expect(destination.scanPlexMode).to.be.eq("Simplex");
    });

    it("Parse shortcut", async () => {
      expect(destination.shortcut).to.be.eq("SavePDF");
    });

    it("Parse resourceURI", async () => {
      expect(destination.resourceURI).to.be.eq(
        "/WalkupScanToComp/WalkupScanToCompDestinations/1c881fde-c4a0-1f08-822f-a01d48c5c091"
      );
    });

    it("Parse hostname", async () => {
      expect(destination.hostname).to.be.eq("FIXE");
    });

    it("Parse name", async () => {
      expect(destination.name).to.be.eq("FIXE");
    });
  });
  describe("Parsing walkupScanDestination_with_ScanPlexMode_Duplex.xml", async () => {
    let destination: WalkupScanToCompDestination;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/walkupScanDestination_with_ScanPlexMode_Duplex.xml"
        ),
        { encoding: "utf8" }
      );
      destination = await WalkupScanToCompDestination.createWalkupScanToCompDestination(content);
    });

    it("Parse scanPlexMode", async () => {
      expect(destination.scanPlexMode).to.be.eq(ScanPlexMode.Duplex);
    });

    it("Parse shortcut", async () => {
      expect(destination.shortcut).to.be.eq("SavePDF");
    });

    it("Parse resourceURI", async () => {
      expect(destination.resourceURI).to.be.eq(
        "/WalkupScanToComp/WalkupScanToCompDestinations/7845bc9f-46e5-4011-8a2c-482364ffd6c7"
      );
    });

    it("Parse hostname", async () => {
      expect(destination.hostname).to.be.eq("LAPTOP-7ITVHH2O");
    });

    it("Parse name", async () => {
      expect(destination.name).to.be.eq("LAPTOP-7ITVHH2O");
    });
  });
});
