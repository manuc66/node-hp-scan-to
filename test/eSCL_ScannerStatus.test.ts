import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import EsclScanStatus from "../src/hpModels/EsclScanStatus";
import { AdfState } from "../src/hpModels/AdfState";
import { ScannerState } from "../src/hpModels/ScannerState";
import { InputSource } from "../src/type/InputSource";

describe("EsclScanStatus", () => {
  describe("Parsing eSCL_ScannerStatus_empty.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerStatus_empty.xml"),
        { encoding: "utf8" },
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
    it("findJobByUri", async () => {
      expect(
        scanStatus.findJobByUri("/eSCL/ScanJobs/1/")?.getJobUri(),
      ).to.be.eq(undefined);
      expect(
        scanStatus.findJobByUri("/eSCL/ScanJobs/2/")?.getJobUri(),
      ).to.be.eq(undefined);
    });
  });
  describe("Parsing eSCL_ScannerStatus_empty_570.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerStatus_empty_570.xml"),
        { encoding: "utf8" },
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
    it("findJobByUri", async () => {
      expect(
        scanStatus
          .findJobByUri("/eSCL/ScanJobs/f6f17dc4-536e-4bcb-b622-5d25bb6880be")
          ?.getJobUri(),
      ).to.be.eq("/eSCL/ScanJobs/f6f17dc4-536e-4bcb-b622-5d25bb6880be");
      expect(
        scanStatus
          .findJobByUri("/eSCL/ScanJobs/4079bb49-d84d-4e6f-b093-c1aa5382541a")
          ?.getJobUri(),
      ).to.be.eq("/eSCL/ScanJobs/4079bb49-d84d-4e6f-b093-c1aa5382541a");
    });
  });
  describe("Parsing eSCL_ScannerStatus_loaded.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerStatus_loaded.xml"),
        { encoding: "utf8" }, //
      );
      scanStatus = await EsclScanStatus.createScanStatus(content);
    });

    it("Parse adfState", async () => {
      expect(scanStatus.adfState).to.be.eq(AdfState.Loaded);
    });
    it("Parse scannerState", async () => {
      expect(scanStatus.scannerState).to.be.eq(ScannerState.Idle);
    });
    it("getInputSource", async () => {
      expect(scanStatus.getInputSource()).to.be.eq("Adf");
    });
    it("isLoaded", async () => {
      expect(scanStatus.isLoaded()).to.be.eq(true);
    });
    it("findJobByUri", async () => {
      expect(
        scanStatus.findJobByUri("/eSCL/ScanJobs/1/")?.getJobUri(),
      ).to.be.eq("/eSCL/ScanJobs/1");
      expect(
        scanStatus.findJobByUri("/eSCL/ScanJobs/2/")?.getJobUri(),
      ).to.be.eq(undefined);
    });
  });
  describe("Parsing eSCL_ScannerStatus_processing.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerStatus_processing.xml"),
        { encoding: "utf8" }, //
      );
      scanStatus = await EsclScanStatus.createScanStatus(content);
    });

    it("Parse adfState", async () => {
      expect(scanStatus.adfState).to.be.eq(AdfState.Empty);
    });
    it("Parse scannerState", async () => {
      expect(scanStatus.scannerState).to.be.eq(ScannerState.Processing);
    });
    it("getInputSource", async () => {
      expect(scanStatus.getInputSource()).to.be.eq(InputSource.Platen);
    });
    it("isLoaded", async () => {
      expect(scanStatus.isLoaded()).to.be.eq(false);
    });
    it("findJobByUri", async () => {
      expect(
        scanStatus.findJobByUri("/eSCL/ScanJobs/1/")?.getJobUri(),
      ).to.be.eq("/eSCL/ScanJobs/1");
      expect(
        scanStatus.findJobByUri("/eSCL/ScanJobs/2/")?.getJobUri(),
      ).to.be.eq("/eSCL/ScanJobs/2");
    });
  });
  describe("Parsing eSCL_ScannerStatus_completed.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerStatus_completed.xml"),
        { encoding: "utf8" }, //
      );
      scanStatus = await EsclScanStatus.createScanStatus(content);
    });

    it("Parse adfState", async () => {
      expect(scanStatus.adfState).to.be.eq(AdfState.Empty);
    });
    it("Parse scannerState", async () => {
      expect(scanStatus.scannerState).to.be.eq(ScannerState.Processing);
    });
    it("getInputSource", async () => {
      expect(scanStatus.getInputSource()).to.be.eq(InputSource.Platen);
    });
    it("isLoaded", async () => {
      expect(scanStatus.isLoaded()).to.be.eq(false);
    });
    it("findJobByUri", async () => {
      expect(
        scanStatus.findJobByUri("/eSCL/ScanJobs/1/")?.getJobUri(),
      ).to.be.eq("/eSCL/ScanJobs/1");
      expect(
        scanStatus.findJobByUri("/eSCL/ScanJobs/2/")?.getJobUri(),
      ).to.be.eq("/eSCL/ScanJobs/2");
    });
  });
});
