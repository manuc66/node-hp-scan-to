import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import DiscoveryTree from "../src/DiscoveryTree";

describe("DiscoveryTree", () => {
  describe("Parsing discoveryTree.xml", async () => {
    let discoveryTree: DiscoveryTree;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/discoveryTree.xml"
        ),
        { encoding: "utf8" }
      );
      discoveryTree = await DiscoveryTree.createDiscoveryTree(content);
    });

    it("Parse WalkupScanToCompManifest uri", async () => {
      expect(discoveryTree.WalkupScanToCompManifestURI).to.be.eq("/WalkupScanToComp/WalkupScanToCompManifest.xml");
    });
    it("Parse WalkupScanManifest uri", async () => {
      expect(discoveryTree.WalkupScanManifestURI).to.be.eq(null);
    });
    it("Parse ScanJobManifest uri", async () => {
      expect(discoveryTree.ScanJobManifestURI).to.be.eq("/Scan/ScanJobManifest.xml");
    });
  });
  describe("Parsing discoveryTree2.xml", async () => {
    let discoveryTree: DiscoveryTree;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/discoveryTree2.xml"
        ),
        { encoding: "utf8" }
      );
      discoveryTree = await DiscoveryTree.createDiscoveryTree(content);
    });

    it("Parse WalkupScanToCompManifest uri", async () => {
      expect(discoveryTree.WalkupScanToCompManifestURI).to.be.eq(null);
    });
    it("Parse WalkupScanManifest uri", async () => {
      expect(discoveryTree.WalkupScanManifestURI).to.be.eq("/WalkupScan/WalkupScanManifest.xml");
    });
    it("Parse ScanJobManifest uri", async () => {
      expect(discoveryTree.ScanJobManifestURI).to.be.eq("/Scan/ScanJobManifest.xml");
    });
  });
});
