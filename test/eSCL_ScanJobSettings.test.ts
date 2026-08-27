import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import { InputSource } from "../src/type/InputSource.js";
import EsclScanJobSettings from "../src/hpModels/EsclScanJobSettings.js";
import EsclScanCaps from "../src/hpModels/EsclScanCaps.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";

import { fileURLToPath } from "url";
import { createImageFormat } from "../src/imageFormats/index.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ScanJobSettings", () => {
  describe("toXML", () => {
    it("Allows to describe an ADF two side", async () => {
      const scanJobSettings = new EsclScanJobSettings(
        InputSource.Adf,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        200,
        ScanMode.Color,
        null,
        null,
        true,
      );

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScanJob_adf_duplex_job.xml"),
        { encoding: "utf8" },
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(
        content.trimEnd().replace(/\r\n/g, "\n"),
      );
    });
    it("Allows to describe an platen", async () => {
      const scanJobSettings = new EsclScanJobSettings(
        InputSource.Platen,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        600,
        ScanMode.Color,
        2481,
        3507,
        false,
      );

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScanJob_platen.xml"),
        { encoding: "utf8" },
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(
        content.trimEnd().replace(/\r\n/g, "\n"),
      );
    });
    it("Allows to override the tone map (passthrough without caps)", async () => {
      const scanJobSettings = new EsclScanJobSettings(
        InputSource.Platen,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        200,
        ScanMode.Color,
        null,
        null,
        false,
        {
          brightness: 1500,
          contrast: 500,
          gamma: 200,
          highlight: 1200,
          shadow: 100,
        },
      );

      const xml = await scanJobSettings.toXML();
      expect(xml).to.contain("<Brightness>1500</Brightness>");
      expect(xml).to.contain("<Contrast>500</Contrast>");
      expect(xml).to.contain("<Gamma>200</Gamma>");
      expect(xml).to.contain("<Highlight>1200</Highlight>");
      expect(xml).to.contain("<Shadow>100</Shadow>");
    });
    it("Clamps tone map to device ranges and omits unsupported transforms", async () => {
      const capsContent: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerCapabilities_Simplex.xml"),
        { encoding: "utf8" },
      );
      const scanCaps = await EsclScanCaps.createScanCaps(capsContent);

      const scanJobSettings = new EsclScanJobSettings(
        InputSource.Adf,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        200,
        ScanMode.Color,
        null,
        null,
        true,
        {
          brightness: 2500,
          contrast: -10,
          gamma: 9999,
          highlight: 9999,
          shadow: 9999,
        },
        scanCaps,
      );

      const xml = await scanJobSettings.toXML();
      expect(xml).to.contain("<Brightness>2000</Brightness>");
      expect(xml).to.contain("<Contrast>0</Contrast>");
      expect(xml).not.to.contain("<Gamma>");
      expect(xml).not.to.contain("<Highlight>");
      expect(xml).not.to.contain("<Shadow>");
    });
    it("Clamps tone map values for a device supporting all transforms", async () => {
      const capsContent: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_ScannerCapabilities_Duplex.xml"),
        { encoding: "utf8" },
      );
      const scanCaps = await EsclScanCaps.createScanCaps(capsContent);

      const scanJobSettings = new EsclScanJobSettings(
        InputSource.Adf,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        200,
        ScanMode.Color,
        null,
        null,
        true,
        {
          gamma: 1000,
          highlight: 3000,
          shadow: 2500,
        },
        scanCaps,
      );

      const xml = await scanJobSettings.toXML();
      expect(xml).to.contain("<Gamma>400</Gamma>");
      expect(xml).to.contain("<Highlight>2000</Highlight>");
      expect(xml).to.contain("<Shadow>2000</Shadow>");
    });
  });
});
