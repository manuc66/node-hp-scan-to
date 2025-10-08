import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import WalkupScanManifest from "../src/hpModels/WalkupScanManifest";

describe("WalkupScanManifest", () => {
  describe("Parsing walkupScanManifest.xml", async () => {
    let walkupScanManifest: WalkupScanManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/walkupScanManifest.xml"),
        { encoding: "utf8" },
      );
      walkupScanManifest =
        await WalkupScanManifest.createWalkupScanManifest(content);
    });

    it("Parse walkupScanDestinationsURI uri", async () => {
      expect(walkupScanManifest.walkupScanDestinationsURI).to.be.eq(
        "/WalkupScan/WalkupScanDestinations",
      );
    });
  });
});
