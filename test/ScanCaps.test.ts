import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import ScanCaps from "../src/hpModels/ScanCaps";

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
    it("AdfDuplexMaxWidth", async () => {
      expect(scanCaps.adfDuplexMaxWidth).to.be.eq(2550);
    });
    it("AdfDuplexMaxHeight", async () => {
      expect(scanCaps.adfDuplexMaxHeight).to.be.eq(4200);
    });
    it("PlatenMaxWidth", async () => {
      expect(scanCaps.platenMaxWidth).to.be.eq(2550);
    });
    it("PlatenMaxHeight", async () => {
      expect(scanCaps.platenMaxHeight).to.be.eq(3508);
    });
    it("AdfDetectPaperLoaded", async () => {
      expect(scanCaps.hasAdfDetectPaperLoaded).to.be.eq(true);
    });
    it("AdfDuplex", async () => {
      expect(scanCaps.hasAdfDuplex).to.be.eq(false);
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
    it("AdfDuplexMaxWidth", async () => {
      expect(scanCaps.adfDuplexMaxWidth).to.be.eq(null);
    });
    it("AdfDuplexMaxHeight", async () => {
      expect(scanCaps.adfDuplexMaxHeight).to.be.eq(null);
    });
    it("PlatenMaxWidth", async () => {
      expect(scanCaps.platenMaxWidth).to.be.eq(2550);
    });
    it("PlatenMaxHeight", async () => {
      expect(scanCaps.platenMaxHeight).to.be.eq(3508);
    });
    it("AdfDetectPaperLoaded", async () => {
      expect(scanCaps.hasAdfDetectPaperLoaded).to.be.eq(false);
    });
    it("AdfDuplex", async () => {
      expect(scanCaps.hasAdfDuplex).to.be.eq(false);
    });
  });
  describe("Parsing ScanCaps_only_adf.xml", async () => {
    let scanCaps: ScanCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/ScanCaps_only_adf.xml"
        ),
        { encoding: "utf8" } //
      );
      scanCaps = await ScanCaps.createScanCaps(content);
    });

    it("AdfMaxWidth", async () => {
      expect(scanCaps.adfMaxWidth).to.be.eq(2550);
    });
    it("AdfMaxHeight", async () => {
      expect(scanCaps.adfMaxHeight).to.be.eq(5100);
    });
    it("AdfDuplexMaxWidth", async () => {
      expect(scanCaps.adfDuplexMaxWidth).to.be.eq(2550);
    });
    it("AdfDuplexMaxHeight", async () => {
      expect(scanCaps.adfDuplexMaxHeight).to.be.eq(5100);
    });
    it("PlatenMaxWidth", async () => {
      expect(scanCaps.platenMaxWidth).to.be.eq(null);
    });
    it("PlatenMaxHeight", async () => {
      expect(scanCaps.platenMaxHeight).to.be.eq(null);
    });
    it("AdfDetectPaperLoaded", async () => {
      expect(scanCaps.hasAdfDetectPaperLoaded).to.be.eq(true);
    });
    it("AdfDuplex", async () => {
      expect(scanCaps.hasAdfDuplex).to.be.eq(false);
    });
  });
  describe("Parsing ScanCaps_with_duplex_adf.xml", async () => {
    let scanCaps: ScanCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/ScanCaps_with_duplex_adf.xml"
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
    it("AdfDuplexMaxWidth", async () => {
      expect(scanCaps.adfDuplexMaxWidth).to.be.eq(2550);
    });
    it("AdfDuplexMaxHeight", async () => {
      expect(scanCaps.adfDuplexMaxHeight).to.be.eq(3508);
    });
    it("PlatenMaxWidth", async () => {
      expect(scanCaps.platenMaxWidth).to.be.eq(2550);
    });
    it("PlatenMaxHeight", async () => {
      expect(scanCaps.platenMaxHeight).to.be.eq(3534);
    });
    it("AdfDetectPaperLoaded", async () => {
      expect(scanCaps.hasAdfDetectPaperLoaded).to.be.eq(true);
    });
    it("AdfDuplex", async () => {
      expect(scanCaps.hasAdfDuplex).to.be.eq(true);
    });
  });
});
