import { describe } from "mocha";
import { expect } from "chai";
import PathHelper from "../src/PathHelper";

describe("PathHelper", () => {
  describe("getFileForPage", () => {
    it("Can format a file with formatted timestamp", async () => {
      const nextFileName = PathHelper.getFileForPage(
        "someFolder",
        2,
        1,
        '"scan"_dd.mm.yyyy_HH:MM:ss',
        "jpg"
      );
      const now = new Date();
      expect(nextFileName).to.be.eq(
        `someFolder/scan_${("" + now.getDate()).padStart(2, "0")}.${(
          "" +
          (now.getMonth() + 1)
        ).padStart(2, "0")}.${("" + now.getFullYear()).padStart(4, "0")}_${(
          "" + (now.getHours())
        ).padStart(2, "0")}:${("" + now.getMinutes()).padStart(2, "0")}:${(
          "" + now.getSeconds()
        ).padStart(2, "0")}.jpg`
      );
    });
    it("Can format a file based on scan count and page number", async () => {
      const nextFileName = PathHelper.getFileForPage(
        "someFolder",
        2,
        1,
        undefined,
        "jpg"
      );
      expect(nextFileName).to.be.eq(`someFolder/scan2_page1.jpg`);
    });
  });
});
