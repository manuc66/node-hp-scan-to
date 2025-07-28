import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import EsclScanStatus from "../src/hpModels/EsclScanStatus";

describe("EsclScanStatus", () => {
  describe("Parsing eSCL_ScannerStatus_loaded.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/eSCL_ScannerStatus_loaded.xml"
        ),
        { encoding: "utf8" } //
      );
      scanStatus = await EsclScanStatus.createScanStatus(content);
    });

    it("Parse adfState", async () => {
      expect(scanStatus.adfState).to.be.eq("Loaded");
    });
    it("Parse scannerState", async () => {
      expect(scanStatus.scannerState).to.be.eq("Idle");
    });
    it("getInputSource", async () => {
      expect(scanStatus.getInputSource()).to.be.eq("Adf");
    });
    it("isLoaded", async () => {
      expect(scanStatus.isLoaded()).to.be.eq(true);
    });
  });
  describe("Parsing eSCL_ScannerStatus_empty.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/eSCL_ScannerStatus_empty.xml"
        ),
        { encoding: "utf8" }
      );
      scanStatus = await EsclScanStatus.createScanStatus(content);
    });

    it("Parse adfState", async () => {
      expect(scanStatus.adfState).to.be.eq("Empty");
    });
    it("Parse scannerState", async () => {
      expect(scanStatus.scannerState).to.be.eq("Idle");
    });
    it("getInputSource", async () => {
      expect(scanStatus.getInputSource()).to.be.eq("Platen");
    });
    it("isLoaded", async () => {
      expect(scanStatus.isLoaded()).to.be.eq(false);
    });
  });
});
