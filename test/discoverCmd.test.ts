import { expect } from "chai";
import { readFile } from "fs/promises";
import DiscoveryTree from "../src/type/DiscoveryTree.js";

describe("discoverCmd", () => {
  describe("looksLikeHpScanDevice", () => {
    it("detects a real HP DiscoveryTree document", async () => {
      const content = await readFile("./test/asset/discoveryTree.xml", "utf-8");
      expect(DiscoveryTree.looksLikeHpScanDevice(content)).to.equal(true);
    });

    it("rejects an XML without scan manifests", () => {
      const content = `<?xml version="1.0" encoding="UTF-8" ?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/2007/09/21">
    <ledm:SupportedIfc>
        <ledm:ManifestURI>/Copy/CopyManifest.xml</ledm:ManifestURI>
        <dd:ResourceType>ledm:hpLedmCopyManifest</dd:ResourceType>
    </ledm:SupportedIfc>
</ledm:DiscoveryTree>`;
      expect(DiscoveryTree.looksLikeHpScanDevice(content)).to.equal(false);
    });

    it("rejects arbitrary non HP content", () => {
      expect(
        DiscoveryTree.looksLikeHpScanDevice(
          "<html><body>router admin</body></html>",
        ),
      ).to.equal(false);
    });
  });
});
