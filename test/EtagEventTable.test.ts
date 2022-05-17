import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import EventTable from "../src/EventTable";
import { EtagEventTable } from "../src/EventTable";

describe("EtagEventTable", () => {
  describe("Parsing eventTable.xml", async () => {
    let etagEventTable: EtagEventTable;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/eventTable.xml"
        ),
        { encoding: "utf8" }
      );
      etagEventTable = await EventTable.createEtagEventTable( content, "tag1");
    });

    it("tag", async () => {
      expect(etagEventTable.etag).to.be.eq("tag1");
    });

    it("Parse event compEventURI", async () => {
      expect(etagEventTable.eventTable.events[0].compEventURI).to.be.eq(undefined);
    });

    it("Parse event destinationURI", async () => {
      expect(etagEventTable.eventTable.events[0].destinationURI).to.be.eq(undefined);
      expect(etagEventTable.eventTable.events[4].destinationURI).to.be.eq("http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113");
    });

    it("Parse event isScanEvent", async () => {
      expect(etagEventTable.eventTable.events[0].isScanEvent).to.be.eq(false);
      expect(etagEventTable.eventTable.events[4].isScanEvent).to.be.eq(true);
    });
    it("Parse event unqualifiedEventCategory", async () => {
      expect(etagEventTable.eventTable.events[0].unqualifiedEventCategory).to.be.eq("DeviceCapabilitiesChanged");
      expect(etagEventTable.eventTable.events[4].unqualifiedEventCategory).to.be.eq("ScanEvent");
    });
    it("Parse event agingStamp", async () => {
      expect(etagEventTable.eventTable.events[0].agingStamp).to.be.eq("139-1");
    });
  });
  describe("Parsing eventTableComp.xml", async () => {
    let etagEventTable: EtagEventTable;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(
          __dirname,
          "./asset/eventTableComp.xml"
        ),
        { encoding: "utf8" }
      );
      etagEventTable = await EventTable.createEtagEventTable( content, "tag1");
    });

    it("tag", async () => {
      expect(etagEventTable.etag).to.be.eq("tag1");
    });

    it("Parse event compEventURI", async () => {
      expect(etagEventTable.eventTable.events[0].compEventURI).to.be.eq(undefined);
      expect(etagEventTable.eventTable.events[3].compEventURI).to.be.eq("/WalkupScanToComp/WalkupScanToCompEvent");
    });

    it("Parse event destinationURI", async () => {
      expect(etagEventTable.eventTable.events[0].destinationURI).to.be.eq(undefined);
      expect(etagEventTable.eventTable.events[3].destinationURI).to.be.eq("/WalkupScanToComp/WalkupScanToCompDestinations/ab60a563-5a97-4386-bd36-ec63cbbff933");
    });

    it("Parse event isScanEvent", async () => {
      expect(etagEventTable.eventTable.events[0].isScanEvent).to.be.eq(false);
      expect(etagEventTable.eventTable.events[3].isScanEvent).to.be.eq(true);
    });
    it("Parse event unqualifiedEventCategory", async () => {
      expect(etagEventTable.eventTable.events[0].unqualifiedEventCategory).to.be.eq("DeviceCapabilitiesChanged");
      expect(etagEventTable.eventTable.events[3].unqualifiedEventCategory).to.be.eq("ScanEvent");
    });
    it("Parse event agingStamp", async () => {
      expect(etagEventTable.eventTable.events[0].agingStamp).to.be.eq("1-16");
    });
  });
});
