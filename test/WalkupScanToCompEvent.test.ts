import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import HPApi from "../src/HPApi";
import WalkupScanToCompDestination from "../src/WalkupScanToCompDestination";
import WalkupScanDestination from "../src/WalkupScanDestination";
import WalkupScanToCompEvent from "../src/WalkupScanToCompEvent";

describe("WalkupScanToCompEvent", () => {
  describe("Parsing walkupScanToCompEvent.xml", async () => {
    let compEvent: WalkupScanToCompEvent;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/walkupScanToCompEvent.xml"
        ),
        { encoding: "utf8" }
      );
      compEvent = await HPApi.createWalkupScanToCompEvent(content);
    });

    it("Parse eventType", async () => {
      expect(compEvent.eventType).to.be.eq("HostSelected");
    });
  });
});
