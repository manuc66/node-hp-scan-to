import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import WalkupScanToCompDestinations from "../src/hpModels/WalkupScanToCompDestinations.js";

const __dirname = import.meta.dirname;

describe("WalkupScanToCompDestinations", () => {
  describe("Parsing walkupScanToCompDestination_with_ScanPlexMode.xml", async () => {
    let destinations: WalkupScanToCompDestinations;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/walkupScanToCompDestinations.xml"),
        { encoding: "utf8" },
      );
      destinations =
        await WalkupScanToCompDestinations.createWalkupScanToCompDestinations(
          content,
        );
    });

    it("Parse scanPlexMode", async () => {
      expect(destinations.destinations[0].scanPlexMode).to.be.eq(null);
    });

    it("Parse shortcut", async () => {
      expect(destinations.destinations[0].shortcut).to.be.eq(null);
    });

    it("Parse resourceURI", async () => {
      expect(destinations.destinations[0].resourceURI).to.be.eq(
        "/WalkupScanToComp/WalkupScanToCompDestinations/4ad05d8e-20e8-4b8c-bdaa-5e6eca0dd3d8",
      );
    });

    it("Parse hostname", async () => {
      expect(destinations.destinations[0].hostname).to.be.eq("8d170beb5887");
    });

    it("Parse name", async () => {
      expect(destinations.destinations[0].name).to.be.eq("8d170beb5887");
    });
  });
});
