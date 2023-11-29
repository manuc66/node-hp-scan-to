import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import ScanCaps from "../src/ScanCaps";

describe("ScanCaps", () => {
  describe("Parsing ScanCaps_with_adf.xml", async () => {
    let scanCaps: ScanCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/ScanCaps_with_adf.xml"
        ),
        { encoding: "utf8" } //
      );
      scanCaps = await ScanCaps.createScanCaps(content);
    });

    it("AdfMaxWidth", async () => {
      expect(scanCaps.adfMaxWidth).to.be.eq(2550);
    });
    it("AdfMaxHeight", async () => {
      expect(scanCaps.adfMaxHeight).to.be.eq(4200);
    });
    it("PlatenMaxWidth", async () => {
      expect(scanCaps.platenMaxWidth).to.be.eq(2550);
    });
    it("PlatenMaxHeight", async () => {
      expect(scanCaps.platenMaxHeight).to.be.eq(3508);
    });
  });
  describe("Parsing ScanCaps_no_adf.xml", async () => {
    let scanCaps: ScanCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/ScanCaps_no_adf.xml"
        ),
        { encoding: "utf8" } //
      );
      scanCaps = await ScanCaps.createScanCaps(content);
    });

    it("AdfMaxWidth", async () => {
      expect(scanCaps.adfMaxWidth).to.be.eq(null);
    });
    it("AdfMaxHeight", async () => {
      expect(scanCaps.adfMaxHeight).to.be.eq(null);
    });
    it("PlatenMaxWidth", async () => {
      expect(scanCaps.platenMaxWidth).to.be.eq(2550);
    });
    it("PlatenMaxHeight", async () => {
      expect(scanCaps.platenMaxHeight).to.be.eq(3508);
    });
  });
});
