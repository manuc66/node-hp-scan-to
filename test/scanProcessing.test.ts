import { describe, it } from "mocha";
import { expect } from "chai";
import nock from "nock";
import { isPdf, tryGetDestination } from "../src/scanProcessing.js";
import { KnownShortcut } from "../src/type/KnownShortcut.js";
import HPApi from "../src/HPApi.js";
import type { IEvent } from "../src/hpModels/Event.js";

describe("scanProcessing", () => {
  describe("isPdf", () => {
    it("returns true for PDF shortcuts", () => {
      expect(isPdf({ shortcut: KnownShortcut.SavePDF, scanPlexMode: null })).to
        .be.true;
      expect(isPdf({ shortcut: KnownShortcut.EmailPDF, scanPlexMode: null })).to
        .be.true;
      expect(
        isPdf({ shortcut: KnownShortcut.SaveDocument1, scanPlexMode: null }),
      ).to.be.true;
    });

    it("returns false for JPEG/Photo shortcuts", () => {
      expect(isPdf({ shortcut: KnownShortcut.SaveJPEG, scanPlexMode: null })).to
        .be.false;
      expect(isPdf({ shortcut: KnownShortcut.SavePhoto1, scanPlexMode: null }))
        .to.be.false;
    });

    it("returns false for unknown shortcuts", () => {
      expect(
        isPdf({
          shortcut: "Unknown" as unknown as KnownShortcut,
          scanPlexMode: null,
        }),
      ).to.be.false;
    });
  });

  describe("tryGetDestination", () => {
    beforeEach(() => {
      HPApi.setDeviceIP("127.0.0.1");
      if (!nock.isActive()) {
        nock.activate();
      }
    });

    afterEach(() => {
      nock.cleanAll();
      nock.restore();
    });

    it("returns destination when shortcut is available", async () => {
      nock("http://127.0.0.1")
        .persist()
        .get("/WalkupScan/Destinations/1")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanDestinations xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscandestinations/2009/03/12">
  <wus:WalkupScanDestination>
    <wus:WalkupScanSettings>
      <wus:Shortcut>SavePDF</wus:Shortcut>
    </wus:WalkupScanSettings>
  </wus:WalkupScanDestination>
</wus:WalkupScanDestinations>`,
        );

      const event: IEvent = {
        destinationURI: "/WalkupScan/Destinations/1",
        unqualifiedEventCategory: "ScanEvent",
        agingStamp: "1",
        compEventURI: undefined,
        isScanEvent: true,
      };
      const destination = await tryGetDestination(event);

      expect(destination).to.not.be.null;
      expect(destination?.shortcut).to.equal(KnownShortcut.SavePDF);
    });
  });
});
