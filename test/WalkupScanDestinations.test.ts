import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import WalkupScanDestinations from "../src/WalkupScanDestinations";

describe("WalkupScanDestinations", () => {
  describe("Parsing walkupScanDestinations.xml", async () => {
    let destinations: WalkupScanDestinations;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/walkupScanDestinations.xml"
        ),
        { encoding: "utf8" }
      );
      destinations = await WalkupScanDestinations.createWalkupScanDestinations(content);
    });

    it("Parse scanPlexMode", async () => {
      expect(destinations.destinations[0].scanPlexMode).to.be.eq(null);
    });

    it("Parse shortcut", async () => {
      expect(destinations.destinations[0].shortcut).to.be.eq(null);
    });

    it("Parse resourceURI", async () => {
      expect(destinations.destinations[0].resourceURI).to.be.eq(
        "http://192.168.1.30:80/WalkupScan/WalkupScanDestinations/1c856ba3-b916-1f08-be4e-2c768ab21113"
      );
    });

    it("Parse hostname", async () => {
      expect(destinations.destinations[0].hostname).to.be.eq("manu-sve1511b1ew");
    });

    it("Parse name", async () => {
      expect(destinations.destinations[0].name).to.be.eq("manu-sve1511b1ew");
    });
  });
  describe("Parsing walkupScanDestinations2.xml", async () => {
    let destinations: WalkupScanDestinations;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/walkupScanDestinations2.xml"
        ),
        { encoding: "utf8" }
      );
      destinations = await WalkupScanDestinations.createWalkupScanDestinations(content);
    });

    it("Parse destinations", async () => {
      expect(destinations.destinations).to.be.empty;
    });
  });
});
