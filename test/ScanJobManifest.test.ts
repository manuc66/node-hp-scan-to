import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import ScanJobManifest from "../src/hpModels/ScanJobManifest.js";

const __dirname = import.meta.dirname;

describe("ScanJobManifest", () => {
  describe("Parsing scanJobManifest.xml", async () => {
    let scanJobManifest: ScanJobManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/scanJobManifest.xml"),
        { encoding: "utf8" },
      );
      scanJobManifest = await ScanJobManifest.createScanJobManifest(content);
    });

    it("Parse ScanCaps uri", async () => {
      expect(scanJobManifest.ScanCapsURI).to.be.eq("/Scan/ScanCaps");
    });

    it("Parse Status uri", async () => {
      expect(scanJobManifest.StatusURI).to.be.eq("/Scan/Status");
    });
  });
  describe("Parsing scanJobManifest2.xml", async () => {
    let scanJobManifest: ScanJobManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/scanJobManifest2.xml"),
        { encoding: "utf8" },
      );
      scanJobManifest = await ScanJobManifest.createScanJobManifest(content);
    });

    it("Parse ScanCaps uri", async () => {
      expect(scanJobManifest.ScanCapsURI).to.be.eq("/Scan/ScanCaps");
    });

    it("Parse Status uri", async () => {
      expect(scanJobManifest.StatusURI).to.be.eq("/Scan/Status");
    });

    it("Parse Status uri", async () => {
      expect(scanJobManifest.StatusURI).to.be.eq("/Scan/Status");
    });
  });
});
