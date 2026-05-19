import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { clearRegistrationsCmd } from "../src/commands/clearRegistrationsCmd.js";
import { singleScanCmd } from "../src/commands/singleScanCmd.js";
import HPApi from "../src/HPApi.js";
import nock from "nock";

describe("commands", () => {
  beforeEach(() => {
    nock.disableNetConnect();
    HPApi.setDeviceIP("127.0.0.1");
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("clearRegistrationsCmd", () => {
    it("should clear all registrations", async () => {
      nock("http://127.0.0.1")
        .get("/WalkupScanToComp/WalkupScanToCompDestinations")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
          <wus:WalkupScanToCompDestinations xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscantocomp/2009/01/13" xmlns:dd="http://www.hp.com/schemas/imaging/con/ledm/common/2008/10/31" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/walkupscantocomp/2009/01/13 WalkupScanToCompDestinations.xsd">
              <wus:WalkupScanToCompDestination>
                  <dd:Name>dest1</dd:Name>
                  <dd:ResourceURI>/WalkupScanToComp/Destinations/1</dd:ResourceURI>
              </wus:WalkupScanToCompDestination>
          </wus:WalkupScanToCompDestinations>`,
        );

      nock("http://127.0.0.1")
        .delete("/WalkupScanToComp/Destinations/1")
        .reply(200);

      await clearRegistrationsCmd();
    });

    it("should handle empty destinations", async () => {
      nock("http://127.0.0.1")
        .get("/WalkupScanToComp/WalkupScanToCompDestinations")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
          <wus:WalkupScanToCompDestinations xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscantocomp/2009/01/13">
          </wus:WalkupScanToCompDestinations>`,
        );

      await expect(clearRegistrationsCmd()).to.be.fulfilled;
    });
  });

  describe("singleScanCmd", () => {
    it("should be a function", () => {
      expect(singleScanCmd).to.be.a("function");
    });
  });
});
