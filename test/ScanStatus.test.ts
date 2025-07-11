import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import ScanStatus from "../src/hpModels/ScanStatus";

describe("ScanStatus", () => {
  describe("Parsing scanStatus.xml", async () => {
    let scanStatus: ScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/scanStatus.xml"
        ),
        { encoding: "utf8" } //
      );
      scanStatus = await ScanStatus.createScanStatus(content);
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
  describe("Parsing sscanStatus_no_adf.xml", async () => {
    let scanStatus: ScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/scanStatus_no_adf.xml"
        ),
        { encoding: "utf8" }
      );
      scanStatus = await ScanStatus.createScanStatus(content);
    });

    it("Parse adfState", async () => {
      expect(scanStatus.adfState).to.be.eq("");
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
