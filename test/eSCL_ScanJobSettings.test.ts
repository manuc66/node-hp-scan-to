import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import { InputSource } from "../src/type/InputSource";
import EsclScanJobSettings from "../src/hpModels/EsclScanJobSettings";

describe("ScanJobSettings", () => {
  describe("toXML",  () => {
    it("Allows to describe an ADF two side", async () => {
      const scanJobSettings = new EsclScanJobSettings(
        InputSource.Adf,
        "Document",
        200,
        null,
        null,
        true);

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCLl_adf_duplex_job.xml"), {encoding:'utf8' }
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(content.trimEnd().replace(/\r\n/g, "\n"));
    });
    it("Allows to describe an platen", async () => {
      const scanJobSettings = new EsclScanJobSettings(
        InputSource.Platen,
        "Document",
        600,
        2481,
        3507,
        false);

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/eSCL_platen.xml"), {encoding:'utf8' }
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(content.trimEnd().replace(/\r\n/g, "\n"));
    });
  });
});
