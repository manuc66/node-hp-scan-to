import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import EsclScanStatus, { eSCLJobState, JobStateReason } from "../src/hpModels/EsclScanStatus";
import { AdfState } from "../src/hpModels/AdfState";
import { ScannerState } from "../src/hpModels/ScannerState";
import { InputSource } from "../src/type/InputSource";

describe("EsclScanStatus", () => {
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
    it("getJobStateReason", async () => {
      expect(scanStatus.getJobStateReason("/eSCL/ScanJobs/1")).to.be.eq(null);
      expect(scanStatus.getJobStateReason("/eSCL/ScanJobs/2")).to.be.eq(null);
    });
    it("getJobState", async () => {
      expect(scanStatus.getJobState("/eSCL/ScanJobs/1")).to.be.eq(null);
      expect(scanStatus.getJobState("/eSCL/ScanJobs/2")).to.be.eq(null);
    });
  });
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
    it("getJobStateReason", async () => {
      expect(scanStatus.getJobStateReason("/eSCL/ScanJobs/1")).to.be.eq(JobStateReason.JobCompletedSuccessfully);
      expect(scanStatus.getJobStateReason("/eSCL/ScanJobs/2")).to.be.eq(null);
    });
    it("getJobState", async () => {
      expect(scanStatus.getJobState("/eSCL/ScanJobs/1")).to.be.eq(eSCLJobState.Completed);
      expect(scanStatus.getJobState("/eSCL/ScanJobs/2")).to.be.eq(null);
    });
  });
  describe("Parsing eSCL_ScannerStatus_processing.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/eSCL_ScannerStatus_processing.xml"
        ),
        { encoding: "utf8" } //
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
    it("getJobStateReason", async () => {
      expect(scanStatus.getJobStateReason("/eSCL/ScanJobs/1")).to.be.eq(JobStateReason.JobCompletedSuccessfully);
      expect(scanStatus.getJobStateReason("/eSCL/ScanJobs/2")).to.be.eq(JobStateReason.JobScanning);
    });
    it("getJobState", async () => {
      expect(scanStatus.getJobState("/eSCL/ScanJobs/1")).to.be.eq(eSCLJobState.Completed);
      expect(scanStatus.getJobState("/eSCL/ScanJobs/2")).to.be.eq(eSCLJobState.Processing);
    });
  });
  describe("Parsing eSCL_ScannerStatus_completed.xml", async () => {
    let scanStatus: EsclScanStatus;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/eSCL_ScannerStatus_completed.xml"
        ),
        { encoding: "utf8" } //
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
    it("getJobStateReason", async () => {
      expect(scanStatus.getJobStateReason("/eSCL/ScanJobs/1")).to.be.eq(JobStateReason.JobCompletedSuccessfully);
      expect(scanStatus.getJobStateReason("/eSCL/ScanJobs/2")).to.be.eq(JobStateReason.JobCompletedSuccessfully);
    });
    it("getJobState", async () => {
      expect(scanStatus.getJobState("/eSCL/ScanJobs/1")).to.be.eq(eSCLJobState.Completed);
      expect(scanStatus.getJobState("/eSCL/ScanJobs/2")).to.be.eq(eSCLJobState.Completed);
    });
  });
});
