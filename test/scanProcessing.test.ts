import { describe, it } from "mocha";
import { expect } from "chai";
import nock from "nock";
import {
  isPdf,
  saveScanFromEvent,
  singleScan,
  tryGetDestination,
} from "../src/scanProcessing.js";
import { KnownShortcut } from "../src/type/KnownShortcut.js";
import HPApi from "../src/HPApi.js";
import type { IEvent } from "../src/hpModels/Event.js";
import { ScannerState } from "../src/hpModels/ScannerState.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import type { ScanConfig, SingleScanConfig } from "../src/type/scanConfigs.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";
import { AdfState } from "../src/hpModels/AdfState.js";
import { InputSource } from "../src/type/InputSource.js";

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

  describe("scanner state check", () => {
    const mockDeviceCapabilities = (state: ScannerState): DeviceCapabilities =>
      ({
        getScanStatus: async () => ({
          scannerState: state,
          adfState: AdfState.Empty,
          getInputSource: () => InputSource.Platen,
          isLoaded: () => false,
        }),
      } as unknown as DeviceCapabilities);

    const scanConfig: ScanConfig = {
      resolution: 200,
      mode: ScanMode.Color,
      format: ScanFormat.Jpeg,
      directoryConfig: {
        directory: "dir",
        tempDirectory: "temp",
      },
      preferEscl: true,
    } as ScanConfig;

    it("saveScanFromEvent aborts if scanner is BusyWithScanJob", async () => {
      const deviceCapabilities = mockDeviceCapabilities(
        ScannerState.BusyWithScanJob,
      );
      const result = await saveScanFromEvent(
        {} as any,
        "folder",
        "temp",
        1,
        deviceCapabilities,
        scanConfig,
        false,
        false,
        PageCountingStrategy.Normal,
      );
      expect(result.elements).to.be.empty;
    });

    it("singleScan aborts if scanner is BusyWithScanJob", async () => {
      const deviceCapabilities = mockDeviceCapabilities(
        ScannerState.BusyWithScanJob,
      );
      // If it doesn't abort, it would call other methods on deviceCapabilities and fail (since they are missing from mock)
      // or at least we check it returns without throwing further errors if we mock just enough.
      await singleScan(
        1,
        "folder",
        "temp",
        { ...scanConfig, generatePdf: false } as SingleScanConfig,
        deviceCapabilities,
        new Date(),
      );
    });
  });
});
