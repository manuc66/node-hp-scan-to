import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import WalkupScanToCompManifest from "../src/hpModels/WalkupScanToCompManifest.js";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("WalkupScanToCompManifest", () => {
  describe("Parsing walkupScanToCompManifest.xml", async () => {
    let walkupScanToCompManifest: WalkupScanToCompManifest;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/walkupScanToCompManifest.xml"),
        { encoding: "utf8" },
      );
      walkupScanToCompManifest =
        await WalkupScanToCompManifest.createWalkupScanToCompManifest(content);
    });

    it("Parse WalkupScanToCompCaps uri", async () => {
      expect(walkupScanToCompManifest.WalkupScanToCompCapsURI).to.be.eq(
        "/WalkupScanToComp/WalkupScanToCompCaps",
      );
    });
  });
});
