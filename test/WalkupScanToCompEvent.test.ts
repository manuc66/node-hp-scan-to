import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import * as fs from "node:fs/promises";
import WalkupScanToCompEvent from "../src/hpModels/WalkupScanToCompEvent";

describe("WalkupScanToCompEvent", () => {
  describe("Parsing walkupScanToCompEvent.xml", async () => {
    let compEvent: WalkupScanToCompEvent;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/walkupScanToCompEvent.xml"),
        { encoding: "utf8" },
      );
      compEvent =
        await WalkupScanToCompEvent.createWalkupScanToCompEvent(content);
    });

    it("Parse eventType", async () => {
      expect(compEvent.eventType).to.be.eq("HostSelected");
    });
  });
});
