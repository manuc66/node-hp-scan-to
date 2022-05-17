import { describe } from "mocha";
import { EtagEventTable } from "../src/EventTable";
import HPApi from "../src/HPApi";

describe("EtagEventTable", () => {
  describe("Parsing eventTable.xml", async () => {
    before(async () => {
      HPApi.setPrinterIP("192.168.1.53");
    });

    it("Clean all destinations", async () => {
      const dests = await HPApi.getWalkupScanToCompDestinations();
      for (let i = 0; i < dests.destinations.length; i++) {
        await HPApi.removeDestination(dests.destinations[i]);
      }
    });
  });
});
