import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import EsclScanJobManifest from "../src/hpModels/EsclManifest";

describe("ScanJobManifest", () => {
  describe("Parsing EsclManifest1.xml", async () => {
    let scanJobManifest: EsclScanJobManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/EsclManifest1.xml"
        ),
        { encoding: "utf8" }
      );
      scanJobManifest = await EsclScanJobManifest.createScanJobManifest(content);
    });

    it("Parse ScanCaps uri", async () => {
      expect(scanJobManifest.ScanCapsURI).to.be.eq("/eSCL/ScannerCapabilities");
    });
  });
  describe("Parsing EsclManifest2.xml", async () => {
    let scanJobManifest: EsclScanJobManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/EsclManifest2.xml"
        ),
        { encoding: "utf8" }
      );
      scanJobManifest = await EsclScanJobManifest.createScanJobManifest(content);
    });

    it("Parse ScanCaps uri", async () => {
      expect(scanJobManifest.ScanCapsURI).to.be.eq("/eSCL/ScannerCapabilities");
    });
  });

});
