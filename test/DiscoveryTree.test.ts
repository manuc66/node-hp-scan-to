import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import DiscoveryTree from "../src/type/DiscoveryTree.js";
const __dirname = import.meta.dirname;

describe("DiscoveryTree", () => {
  describe("Parsing discoveryTree.xml", async () => {
    let discoveryTree: DiscoveryTree;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/discoveryTree.xml"),
        { encoding: "utf8" },
      );
      discoveryTree = await DiscoveryTree.createDiscoveryTree(content);
    });

    it("Parse WalkupScanToCompManifest uri", async () => {
      expect(discoveryTree.WalkupScanToCompManifestURI).to.be.eq(
        "/WalkupScanToComp/WalkupScanToCompManifest.xml",
      );
    });
    it("Parse WalkupScanManifest uri", async () => {
      expect(discoveryTree.WalkupScanManifestURI).to.be.eq(null);
    });
    it("Parse ScanJobManifest uri", async () => {
      expect(discoveryTree.ScanJobManifestURI).to.be.eq(
        "/Scan/ScanJobManifest.xml",
      );
    });
    it("Parse eSclManifest uri", async () => {
      expect(discoveryTree.EsclManifestURI).to.be.eq("/eSCL/eSclManifest.xml");
    });
  });
  describe("Parsing discoveryTree2.xml", async () => {
    let discoveryTree: DiscoveryTree;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/discoveryTree2.xml"),
        { encoding: "utf8" },
      );
      discoveryTree = await DiscoveryTree.createDiscoveryTree(content);
    });

    it("Parse WalkupScanToCompManifest uri", async () => {
      expect(discoveryTree.WalkupScanToCompManifestURI).to.be.eq(null);
    });
    it("Parse WalkupScanManifest uri", async () => {
      expect(discoveryTree.WalkupScanManifestURI).to.be.eq(
        "/WalkupScan/WalkupScanManifest.xml",
      );
    });
    it("Parse ScanJobManifest uri", async () => {
      expect(discoveryTree.ScanJobManifestURI).to.be.eq(
        "/Scan/ScanJobManifest.xml",
      );
    });
    it("Parse eSclManifest uri", async () => {
      expect(discoveryTree.EsclManifestURI).to.be.eq(null);
    });
  });
  describe("Parsing discoveryTree3.xml", async () => {
    let discoveryTree: DiscoveryTree;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/discoveryTree3.xml"),
        { encoding: "utf8" },
      );
      discoveryTree = await DiscoveryTree.createDiscoveryTree(content);
    });

    it("Parse WalkupScanToCompManifest uri", async () => {
      expect(discoveryTree.WalkupScanToCompManifestURI).to.be.eq(
        "/WalkupScanToComp/WalkupScanToCompManifest.xml",
      );
    });
    it("Parse WalkupScanManifest uri", async () => {
      expect(discoveryTree.WalkupScanManifestURI).to.be.eq(null);
    });
    it("Parse ScanJobManifest uri", async () => {
      expect(discoveryTree.ScanJobManifestURI).to.be.eq(null);
    });
    it("Parse eSclManifest uri", async () => {
      expect(discoveryTree.EsclManifestURI).to.be.eq("/eSCL/eSclManifest.xml");
    });
  });
});
