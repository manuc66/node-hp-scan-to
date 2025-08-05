import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import EsclScanCaps from "../src/hpModels/EsclScanCaps";

describe("EsclScanCaps", () => {
  describe("Parsing eSCL_ScannerCapabilities_Duplex.xml", async () => {
    let scanCaps: EsclScanCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerCapabilities_Duplex.xml"),
        { encoding: "utf8" }, //
      );
      scanCaps = await EsclScanCaps.createScanCaps(content);
    });

    it("AdfMaxWidth", async () => {
      expect(scanCaps.adfMaxWidth).to.be.eq(2550);
    });
    it("AdfMaxHeight", async () => {
      expect(scanCaps.adfMaxHeight).to.be.eq(36600);
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
      expect(scanCaps.platenMaxHeight).to.be.eq(4200);
    });
    it("AdfDetectPaperLoaded", async () => {
      expect(scanCaps.hasAdfDetectPaperLoaded).to.be.eq(true);
    });
    it("AdfDuplex", async () => {
      expect(scanCaps.hasAdfDuplex).to.be.eq(true);
    });
  });
  describe("Parsing eSCL_ScannerCapabilities_Simplex.xml", async () => {
    let scanCaps: EsclScanCaps;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerCapabilities_Simplex.xml"),
        { encoding: "utf8" }, //
      );
      scanCaps = await EsclScanCaps.createScanCaps(content);
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
});
