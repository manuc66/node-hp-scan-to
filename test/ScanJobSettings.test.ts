import { describe } from "mocha";
import { expect } from "chai";
import ScanJobSettings from "../src/ScanJobSettings";
import path from "path";
import * as fs from "fs/promises";

describe("ScanJobSettings", () => {
  describe("toXML",  () => {
    it("Allows to describe an ADF two side", async () => {
      const scanJobSettings = new ScanJobSettings("Adf", "Document", true);

      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/adf_duplex_job.xml"), {encoding:'utf8' }
      );
      expect((await scanJobSettings.toXML()).trimEnd()).to.be.eq(content.trimEnd());
    });
  });
});