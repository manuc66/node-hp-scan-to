import { describe } from "mocha";
import { expect } from "chai";
import ScanJobSettings from "../src/hpModels/ScanJobSettings.js";
import ScanCaps from "../src/hpModels/ScanCaps.js";
import path from "node:path";
import * as fs from "node:fs/promises";
import { InputSource } from "../src/type/InputSource.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";

import { fileURLToPath } from "url";
import { createImageFormat } from "../src/imageFormats/index.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ScanJobSettings", () => {
  let scanCaps: ScanCaps;
  before(async () => {
    const content = await fs.readFile(
      path.resolve(__dirname, "./asset/ScanCaps_with_duplex_adf.xml"),
      { encoding: "utf8" },
    );
    scanCaps = await ScanCaps.createScanCaps(content);
  });

  describe("toXML", () => {
    it("Allows to describe an ADF two side", async () => {
      const scanJobSettings = new ScanJobSettings(
        InputSource.Adf,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        200,
        ScanMode.Color,
        null,
        null,
        true,
        scanCaps,
      );

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/adf_duplex_job.xml"),
        { encoding: "utf8" },
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(
        content.trimEnd().replace(/\r\n/g, "\n"),
      );
    });

    it("Allows to describe an ADF single side", async () => {
      const scanJobSettings = new ScanJobSettings(
        InputSource.Adf,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        200,
        ScanMode.Color,
        null,
        null,
        false,
        scanCaps,
      );

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/adf_simplex_job.xml"),
        { encoding: "utf8" },
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(
        content.trimEnd().replace(/\r\n/g, "\n"),
      );
    });

    it("Allows to describe dpi of 300", async () => {
      const scanJobSettings = new ScanJobSettings(
        InputSource.Adf,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        300,
        ScanMode.Color,
        null,
        null,
        false,
        scanCaps,
      );

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/300_dpi_job.xml"),
        { encoding: "utf8" },
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(
        content.trimEnd().replace(/\r\n/g, "\n"),
      );
    });

    it("Allows to describe a custom width and height", async () => {
      const scanJobSettings = new ScanJobSettings(
        InputSource.Adf,
        "Document",
        createImageFormat(ScanFormat.Jpeg),
        200,
        ScanMode.Color,
        1000,
        4000,
        false,
        scanCaps,
      );

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/adf_simplex_custom_job.xml"),
        { encoding: "utf8" },
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(
        content.trimEnd().replace(/\r\n/g, "\n"),
      );
    });
  });
});
