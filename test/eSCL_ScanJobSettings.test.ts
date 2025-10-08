import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import { InputSource } from "../src/type/InputSource";
import EsclScanJobSettings from "../src/hpModels/EsclScanJobSettings";
import { ScanMode } from "../src/type/scanMode";

describe("ScanJobSettings", () => {
  describe("toXML", () => {
    it("Allows to describe an ADF two side", async () => {
      const scanJobSettings = new EsclScanJobSettings(
        InputSource.Adf,
        "Document",
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
  });
});
