import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import WalkupScanToCompCaps from "../src/hpModels/WalkupScanToCompCaps";

describe("WalkupScanToCompCaps", () => {
  describe("Parsing walkupScanToCompCaps.xml", async () => {
    let walkupScanToCompCaps: WalkupScanToCompCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/walkupScanToCompCaps.xml"),
        { encoding: "utf8" },
      );
      walkupScanToCompCaps =
        await WalkupScanToCompCaps.createWalkupScanToCompCaps(content);
    });

    it("Parse supportsMultiItemScanFromPlaten", async () => {
      expect(walkupScanToCompCaps.supportsMultiItemScanFromPlaten).to.be.eq(
        true,
      );
    });
  });
  describe("Parsing walkupScanToCompCaps2.xml", async () => {
    let walkupScanToCompCaps: WalkupScanToCompCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/walkupScanToCompCaps2.xml"),
        { encoding: "utf8" },
      );
      walkupScanToCompCaps =
        await WalkupScanToCompCaps.createWalkupScanToCompCaps(content);
    });

    it("Parse supportsMultiItemScanFromPlaten", async () => {
      expect(walkupScanToCompCaps.supportsMultiItemScanFromPlaten).to.be.eq(
        false,
      );
    });
  });
  describe("Parsing walkupScanToCompCaps3.xml", async () => {
    let walkupScanToCompCaps: WalkupScanToCompCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/walkupScanToCompCaps3.xml"),
        { encoding: "utf8" },
      );
      walkupScanToCompCaps =
        await WalkupScanToCompCaps.createWalkupScanToCompCaps(content);
    });

    it("Parse supportsMultiItemScanFromPlaten", async () => {
      expect(walkupScanToCompCaps.supportsMultiItemScanFromPlaten).to.be.eq(
        true,
      );
    });
  });
});
