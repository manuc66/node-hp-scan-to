import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import EsclScanJobManifest from "../src/hpModels/EsclManifest";

describe("ScanJobManifest", () => {
  describe("Parsing EsclManifest1_ScanJet_Pro_4500.xml", async () => {
    let scanJobManifest: EsclScanJobManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/EsclManifest1_ScanJet_Pro_4500.xml"),
        { encoding: "utf8" },
      );
      scanJobManifest =
        await EsclScanJobManifest.createScanJobManifest(content);
    });

    it("Parse ScanCaps uri", async () => {
      expect(scanJobManifest.scanCapsURI).to.be.eq("/eSCL/ScannerCapabilities");
    });
    it("Parse ScanJobs uri", async () => {
      expect(scanJobManifest.scanJobsURI).to.be.eq("/eSCL/ScanJobs");
    });
    it("Parse ScanJob uri", async () => {
      expect(scanJobManifest.scanJobURI).to.be.eq(
        "/eSCL/ScanJobs/{scan-job-id}",
      );
    });
  });
  describe("Parsing EsclManifest_widePro_477.xml", async () => {
    let scanJobManifest: EsclScanJobManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/EsclManifest_widePro_477.xml"),
        { encoding: "utf8" },
      );
      scanJobManifest =
        await EsclScanJobManifest.createScanJobManifest(content);
    });

    it("Parse ScanCaps uri", async () => {
      expect(scanJobManifest.scanCapsURI).to.be.eq("/eSCL/ScannerCapabilities");
    });
    it("Parse ScanJobs uri", async () => {
      expect(scanJobManifest.scanJobsURI).to.be.eq("/eSCL/ScanJobs");
    });
    it("Parse ScanJob uri", async () => {
      expect(scanJobManifest.scanJobURI).to.be.eq(
        "/eSCL/ScanJobs/{scan-job-id}",
      );
    });
  });
  describe("Parsing EsclManifest_tank_570.xml", async () => {
    let scanJobManifest: EsclScanJobManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/EsclManifest_tank_570.xml"),
        { encoding: "utf8" },
      );
      scanJobManifest =
        await EsclScanJobManifest.createScanJobManifest(content);
    });

    it("Parse ScanCaps uri", async () => {
      expect(scanJobManifest.scanCapsURI).to.be.eq("/eSCL/ScannerCapabilities");
    });
    it("Parse ScanJobs uri", async () => {
      expect(scanJobManifest.scanJobsURI).to.be.eq("/eSCL/ScanJobs");
    });
    it("Parse ScanJob uri", async () => {
      expect(scanJobManifest.scanJobURI).to.be.eq(
        "/eSCL/ScanJobs/{scan-job-id}",
      );
    });
  });
});
