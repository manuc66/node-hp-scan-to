import { expect } from "chai";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import { describe, it, beforeEach, afterEach } from "mocha";
import nock from "nock";
import HPApi from "../src/HPApi.js";
import {
  assembleDuplexScan,
  listenCmd,
  processScanWithDestination,
  handleScanResult,
  determineDuplexModes,
  setupScanParameters,
  processFinishedPartialDuplexScan,
  type FrontOfDoubleSidedScanContext,
} from "../src/commands/listenCmd.js";
import { DuplexAssemblyMode } from "../src/type/DuplexAssemblyMode.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import { DuplexMode } from "../src/type/duplexMode.js";
import { TargetDuplexMode } from "../src/type/targetDuplexMode.js";
import { ScanPlexMode } from "../src/hpModels/ScanPlexMode.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";
import type { WalkupDestination } from "../src/scanProcessing.js";
import { KnownShortcut } from "../src/type/KnownShortcut.js";
import type { SelectedScanTarget } from "../src/type/scanTargetDefinitions.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import { InputSource } from "../src/type/InputSource.js";
import { ScannerState } from "../src/hpModels/ScannerState.js";
import { AdfState } from "../src/hpModels/AdfState.js";
import PathHelper from "../src/PathHelper.js";
import { fileURLToPath } from "url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utility function to create a ScanPage with default values
const createScanPage = (overrides: Partial<ScanPage>): ScanPage => {
  return {
    path: "default.png",
    pageNumber: 1,
    width: 100,
    height: 200,
    xResolution: 300,
    yResolution: 300,
    ...overrides,
  };
};

// Utility function to create ScanContent
const createScanContent = (pages: Partial<ScanPage>[]): ScanContent => {
  return { elements: pages.map(createScanPage) };
};

const createDefaultScanConfig = (tempDir: string): ScanConfig => ({
  resolution: 300,
  mode: ScanMode.Color,
  width: undefined,
  height: undefined,
  format: ScanFormat.Jpeg,
  directoryConfig: {
    directory: tempDir,
    tempDirectory: tempDir,
    filePattern: undefined,
  },
  paperlessConfig: undefined,
  nextcloudConfig: undefined,
  preferEscl: false,
  paperSize: undefined,
  paperDim: undefined,
  paperOrientation: undefined,
});

const makeEvent = (
  overrides: Partial<{
    unqualifiedEventCategory: string;
    agingStamp: string;
    destinationURI: string | undefined;
    compEventURI: string | undefined;
    isScanEvent: boolean;
  }> = {},
) => ({
  unqualifiedEventCategory: "ScanEvent",
  agingStamp: "0",
  destinationURI: "/WalkupScan/Destinations/1",
  compEventURI: undefined,
  isScanEvent: true,
  ...overrides,
});

const createMockDeviceCapabilities = (
  overrides?: Partial<DeviceCapabilities>,
): DeviceCapabilities => ({
  supportsMultiItemScanFromPlaten: false,
  useWalkupScanToComp: false,
  platenMaxWidth: null,
  platenMaxHeight: null,
  adfMaxWidth: null,
  adfMaxHeight: null,
  adfDuplexMaxWidth: null,
  adfDuplexMaxHeight: null,
  hasAdfDuplex: false,
  hasAdfDetectPaperLoaded: false,
  userActionTimeout: null,
  isEscl: false,
  getScanStatus: async () => ({
    scannerState: ScannerState.Idle,
    adfState: AdfState.Empty,
    isLoaded: () => false,
    getInputSource: () => InputSource.Platen,
  }),
  createScanJobSettings: (..._args: unknown[]) =>
    ({
      format: { isJpeg: () => true, getExtension: () => "jpg" },
      mode: ScanMode.Color,
      toXML: async () => "<scanSettings></scanSettings>",
      xResolution: 300,
      yResolution: 300,
    }) as never,
  submitScanJob: async () => "http://127.0.0.1:8080/Scan/Jobs/123",
  ...overrides,
});

describe("assembleDuplexScan", () => {
  it("should assemble pages in natural order for PAGE_WISE mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should reverse backs for DOCUMENT_WISE mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should reverse fronts for REVERSE_FRONT mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.REVERSE_FRONT,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should reverse both fronts and backs for REVERSE_BOTH mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.REVERSE_BOTH,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should handle cases with missing back pages gracefully", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 }, // Only one back page
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should handle cases with missing front pages gracefully", () => {
    const frontScan = createScanContent([]); // No front pages
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should return an empty array if both scans are empty", () => {
    const frontScan = createScanContent([]); // No front pages
    const backScan = createScanContent([]); // No back pages
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(result.elements).to.deep.equal([]);
  });

  it("should interleave unequal pages correctly for DOCUMENT_WISE mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
      { path: "front3.png", pageNumber: 3 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front3.png",
        pageNumber: 3,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });
});

describe("listenCmd", () => {
  let tempDir: string;

  let originalIsAlive: typeof HPApi.isAlive;
  let originalWaitDeviceUp: typeof HPApi.waitDeviceUp;

  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.disableNetConnect();
    HPApi.setDeviceIP("127.0.0.1");
    // Mock HPApi.isAlive to return true instantly
    originalIsAlive = HPApi.isAlive;
    originalWaitDeviceUp = HPApi.waitDeviceUp;
    HPApi.isAlive = async () => true;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "listenCmd-test-"));
  });

  afterEach(() => {
    HPApi.isAlive = originalIsAlive;
    HPApi.waitDeviceUp = originalWaitDeviceUp;
    nock.cleanAll();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should stop after reaching error limit when event polling fails repeatedly", async () => {
    const scanConfig: ScanConfig = {
      resolution: 300,
      mode: ScanMode.Color,
      width: undefined,
      height: undefined,
      format: ScanFormat.Jpeg,
      directoryConfig: {
        directory: tempDir,
        tempDirectory: tempDir,
        filePattern: undefined,
      },
      paperlessConfig: undefined,
      nextcloudConfig: undefined,
      preferEscl: false,
      paperSize: undefined,
      paperDim: undefined,
      paperOrientation: undefined,
    };

    // Mock HPApi.getDiscoveryTree
    nock("http://127.0.0.1:80")
      .persist()
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/2007/09/21" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <ledm:ManifestURI>/Scan/ScanJobManifest</ledm:ManifestURI>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
      );

    // Mock HPApi.getScanJobManifest
    nock("http://127.0.0.1:80")
      .persist()
      .get("/Scan/ScanJobManifest")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/map/2009/03/24" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scan/2008/11/17">
    <map:ResourceMap>
        <map:ResourceLink>
            <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
        </map:ResourceLink>
        <map:ResourceNode>
            <map:ResourceLink>
                <dd:ResourceURI>/Scan/ScanCaps</dd:ResourceURI>
            </map:ResourceLink>
            <map:ResourceType>
                <scan:ScanResourceType>ScanCaps</scan:ScanResourceType>
            </map:ResourceType>
        </map:ResourceNode>
        <map:ResourceNode>
            <map:ResourceLink>
                <dd:ResourceURI>/Scan/Status</dd:ResourceURI>
            </map:ResourceLink>
            <map:ResourceType>
                <scan:ScanResourceType>Status</scan:ScanResourceType>
            </map:ResourceType>
        </map:ResourceNode>
    </map:ResourceMap>
</man:Manifest>`,
      );

    // Mock HPApi.getScanCaps
    nock("http://127.0.0.1:80")
      .persist()
      .get("/Scan/ScanCaps")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
    <PlatenMaxWidth>2550</PlatenMaxWidth>
    <PlatenMaxHeight>3300</PlatenMaxHeight>
</ScanCaps>`,
      );

    // Mock getWalkupScanDestinations
    nock("http://127.0.0.1:80")
      .persist()
      .get("/WalkupScan/WalkupScanDestinations")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanDestinations xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscandestinations/2009/03/12">
</wus:WalkupScanDestinations>`,
      );

    // Mock registerWalkupScanDestination
    nock("http://127.0.0.1:80")
      .persist()
      .post("/WalkupScan/WalkupScanDestinations")
      .reply(201, "", {
        Location: "http://127.0.0.1/WalkupScan/Destinations/1",
      });

    // Mock waitForScanEvent -> HPApi.getEvents to fail
    nock("http://127.0.0.1:80")
      .persist()
      .get("/EventMgmt/EventTable")
      .reply(500);

    // Mock isAlive to return true so errors increment and loop exits after 50
    HPApi.isAlive = async () => true;
    // Mock HPApi.delay to return instantly
    HPApi.delay = async () => {
      /* no-op */
    };
    // Mock waitDeviceUp to return instantly
    HPApi.waitDeviceUp = async () => {
      /* no-op */
    };

    await listenCmd(
      [{ label: "host", isDuplexSingleSide: false }],
      scanConfig,
      1,
    );
  });

  it("should skip scan and continue loop when no shortcut destination is found", async () => {
    const scanConfig: ScanConfig = {
      resolution: 300,
      mode: ScanMode.Color,
      width: undefined,
      height: undefined,
      format: ScanFormat.Jpeg,
      directoryConfig: {
        directory: tempDir,
        tempDirectory: tempDir,
        filePattern: undefined,
      },
      paperlessConfig: undefined,
      nextcloudConfig: undefined,
      preferEscl: false,
      paperSize: undefined,
      paperDim: undefined,
      paperOrientation: undefined,
    };

    nock("http://127.0.0.1:80")
      .persist()
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/2007/09/21" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <ledm:ManifestURI>/Scan/ScanJobManifest</ledm:ManifestURI>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
      );

    nock("http://127.0.0.1:80")
      .persist()
      .get("/Scan/ScanJobManifest")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/map/2009/03/24" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scan/2008/11/17">
    <map:ResourceMap>
        <map:ResourceLink>
            <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
        </map:ResourceLink>
        <map:ResourceNode>
            <map:ResourceLink>
                <dd:ResourceURI>/Scan/ScanCaps</dd:ResourceURI>
            </map:ResourceLink>
            <map:ResourceType>
                <scan:ScanResourceType>ScanCaps</scan:ScanResourceType>
            </map:ResourceType>
        </map:ResourceNode>
        <map:ResourceNode>
            <map:ResourceLink>
                <dd:ResourceURI>/Scan/Status</dd:ResourceURI>
            </map:ResourceLink>
            <map:ResourceType>
                <scan:ScanResourceType>Status</scan:ScanResourceType>
            </map:ResourceType>
        </map:ResourceNode>
    </map:ResourceMap>
</man:Manifest>`,
      );

    nock("http://127.0.0.1:80")
      .persist()
      .get("/Scan/ScanCaps")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
    <PlatenMaxWidth>2550</PlatenMaxWidth>
    <PlatenMaxHeight>3300</PlatenMaxHeight>
</ScanCaps>`,
      );

    nock("http://127.0.0.1:80")
      .persist()
      .get("/WalkupScan/WalkupScanDestinations")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanDestinations xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscandestinations/2009/03/12">
</wus:WalkupScanDestinations>`,
      );

    nock("http://127.0.0.1:80")
      .persist()
      .post("/WalkupScan/WalkupScanDestinations")
      .reply(201, "", {
        Location: "http://127.0.0.1/WalkupScan/Destinations/1",
      });

    const eventTableEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
    <dd:Version>
        <dd:Revision>1</dd:Revision>
    </dd:Version>
</ev:EventTable>`;

    const scanEvent: string = `<?xml version="1.0" encoding="UTF-8"?>
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
    <dd:Version>
        <dd:Revision>1</dd:Revision>
    </dd:Version>
    <ev:Event>
        <dd:UnqualifiedEventCategory>ScanEvent</dd:UnqualifiedEventCategory>
        <dd:AgingStamp>1-1</dd:AgingStamp>
        <ev:Payload>
            <dd:ResourceURI>http://127.0.0.1:80/WalkupScan/Destinations/1</dd:ResourceURI>
            <dd:ResourceType>hpCnxWalkupScanDestinations</dd:ResourceType>
        </ev:Payload>
        <ev:Payload>
            <dd:ResourceURI>/WalkupScanToComp/WalkupScanToCompEvent</dd:ResourceURI>
            <dd:ResourceType>hpCnxWalkupScanToCompEvent</dd:ResourceType>
        </ev:Payload>
    </ev:Event>
</ev:EventTable>`;

    // First getEvents call: no timeout, returns empty events
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .reply(200, eventTableEmpty, { etag: "emptyTag" });

    // Polling getEvents call: with timeout, returns scan event with compEventURI
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .query({ timeout: 1200 })
      .reply(200, scanEvent, { etag: "scanTag" });

    // Mock walkupScanToCompEvent to return ScanPagesComplete (causes waitScanRequest to return false)
    nock("http://127.0.0.1:80")
      .get("/WalkupScanToComp/WalkupScanToCompEvent")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanToCompEvent xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28">
    <wus:WalkupScanToCompEventType>ScanPagesComplete</wus:WalkupScanToCompEventType>
</wus:WalkupScanToCompEvent>`,
      );

    HPApi.isAlive = async () => true;
    HPApi.delay = async () => {
      /* no-op */
    };
    HPApi.waitDeviceUp = async () => {
      /* no-op */
    };

    await listenCmd(
      [{ label: "host", isDuplexSingleSide: false }],
      scanConfig,
      1,
    );
  });

  it("should perform a complete scan flow and update state", async () => {
    const scanConfig: ScanConfig = {
      resolution: 300,
      mode: ScanMode.Color,
      width: undefined,
      height: undefined,
      format: ScanFormat.Jpeg,
      directoryConfig: {
        directory: tempDir,
        tempDirectory: tempDir,
        filePattern: undefined,
      },
      paperlessConfig: undefined,
      nextcloudConfig: undefined,
      preferEscl: false,
      paperSize: undefined,
      paperDim: undefined,
      paperOrientation: undefined,
    };

    nock("http://127.0.0.1:80")
      .persist()
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/2007/09/21" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <ledm:ManifestURI>/Scan/ScanJobManifest</ledm:ManifestURI>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
      );

    nock("http://127.0.0.1:80")
      .persist()
      .get("/Scan/ScanJobManifest")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/map/2009/03/24" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scan/2008/11/17">
    <map:ResourceMap>
        <map:ResourceLink>
            <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
        </map:ResourceLink>
        <map:ResourceNode>
            <map:ResourceLink>
                <dd:ResourceURI>/Scan/ScanCaps</dd:ResourceURI>
            </map:ResourceLink>
            <map:ResourceType>
                <scan:ScanResourceType>ScanCaps</scan:ScanResourceType>
            </map:ResourceType>
        </map:ResourceNode>
        <map:ResourceNode>
            <map:ResourceLink>
                <dd:ResourceURI>/Scan/Status</dd:ResourceURI>
            </map:ResourceLink>
            <map:ResourceType>
                <scan:ScanResourceType>Status</scan:ScanResourceType>
            </map:ResourceType>
        </map:ResourceNode>
    </map:ResourceMap>
</man:Manifest>`,
      );

    nock("http://127.0.0.1:80")
      .persist()
      .get("/Scan/ScanCaps")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
    <PlatenMaxWidth>2550</PlatenMaxWidth>
    <PlatenMaxHeight>3300</PlatenMaxHeight>
</ScanCaps>`,
      );

    nock("http://127.0.0.1:80")
      .persist()
      .get("/WalkupScan/WalkupScanDestinations")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanDestinations xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscandestinations/2009/03/12">
</wus:WalkupScanDestinations>`,
      );

    nock("http://127.0.0.1:80")
      .persist()
      .post("/WalkupScan/WalkupScanDestinations")
      .reply(201, "", {
        Location: "http://127.0.0.1/WalkupScan/Destinations/1",
      });

    const eventTableEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
    <dd:Version>
        <dd:Revision>1</dd:Revision>
    </dd:Version>
</ev:EventTable>`;

    const scanEvent: string = `<?xml version="1.0" encoding="UTF-8"?>
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
    <dd:Version>
        <dd:Revision>1</dd:Revision>
    </dd:Version>
    <ev:Event>
        <dd:UnqualifiedEventCategory>ScanEvent</dd:UnqualifiedEventCategory>
        <dd:AgingStamp>1-1</dd:AgingStamp>
        <ev:Payload>
            <dd:ResourceURI>http://127.0.0.1:80/WalkupScan/Destinations/1</dd:ResourceURI>
            <dd:ResourceType>hpCnxWalkupScanDestinations</dd:ResourceType>
        </ev:Payload>
    </ev:Event>
</ev:EventTable>`;

    // First getEvents call: no timeout, returns empty events
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .reply(200, eventTableEmpty, { etag: "tag1" });

    // Polling getEvents call: with timeout, returns scan event (no compEventURI)
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .query({ timeout: 1200 })
      .reply(200, scanEvent, { etag: "tag2" });

    // Mock HPApi.getScanStatus (called by saveScanFromEvent)
    nock("http://127.0.0.1:80")
      .persist()
      .get("/Scan/Status")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanStatus>
    <ScannerState>Idle</ScannerState>
    <AdfState>Empty</AdfState>
</ScanStatus>`,
      );

    // Mock HPApi.getDestination (called by tryGetDestination) to return a valid destination
    nock("http://127.0.0.1:80")
      .get("/WalkupScan/Destinations/1")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanDestinations xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17">
    <wus:WalkupScanDestination>
        <dd:ResourceURI>http://127.0.0.1/WalkupScan/Destinations/1</dd:ResourceURI>
        <dd:Name>test</dd:Name>
        <dd3:Hostname>test</dd3:Hostname>
        <wus:WalkupScanSettings>
            <scantype:ScanSettings>
                <dd:ScanPlexMode>Simplex</dd:ScanPlexMode>
            </scantype:ScanSettings>
            <wus:Shortcut>SaveJPEG</wus:Shortcut>
        </wus:WalkupScanSettings>
    </wus:WalkupScanDestination>
</wus:WalkupScanDestinations>`,
      );

    // Mock scan job submission (POST)
    nock("http://127.0.0.1:8080")
      .post("/Scan/Jobs")
      .reply(201, "", {
        Location: "http://127.0.0.1:8080/Scan/Jobs/123",
      });

    // Mock getJob polling: first returns Processing with a PreScanPage
    const processingXml = `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Processing</j:JobState>
  <ScanJob>
    <PreScanPage>
      <PageState>ReadyToUpload</PageState>
      <BinaryURL>/Scan/Jobs/123/Pages/1</BinaryURL>
      <PageNumber>1</PageNumber>
      <BufferInfo>
        <ImageWidth>100</ImageWidth>
        <ImageHeight>200</ImageHeight>
        <ScanSettings>
          <InputSource>Platen</InputSource>
          <ContentType>Photo</ContentType>
          <XResolution>300</XResolution>
          <YResolution>300</YResolution>
        </ScanSettings>
      </BufferInfo>
    </PreScanPage>
  </ScanJob>
</j:Job>`;

    const completedXml = `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Completed</j:JobState>
  <ScanJob>
    <PostScanPage>
      <PageNumber>1</PageNumber>
    </PostScanPage>
  </ScanJob>
</j:Job>`;

    const jobScope = nock("http://127.0.0.1:8080");
    jobScope.get("/Scan/Jobs/123").times(2).reply(200, processingXml);
    jobScope
      .get("/Scan/Jobs/123/Pages/1")
      .reply(200, Buffer.from("fake-image-data"), {
        "Content-Type": "image/jpeg",
      });
    jobScope.get("/Scan/Jobs/123").reply(200, completedXml);

    HPApi.isAlive = async () => true;
    HPApi.delay = async () => {
      /* no-op */
    };
    HPApi.waitDeviceUp = async () => {
      /* no-op */
    };

    await listenCmd(
      [{ label: "host", isDuplexSingleSide: false }],
      scanConfig,
      1,
    );
    expect(jobScope.isDone()).to.be.true;
  });
});

describe("determineDuplexModes", () => {
  it("should return Simplex when scanPlexMode is null and not isDuplexSingleSide", () => {
    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: null,
    };
    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: false,
      event: makeEvent(),
    };
    const result = determineDuplexModes(
      destination,
      selectedScanTarget,
      DuplexMode.Simplex,
      undefined,
    );
    expect(result.duplexMode).to.equal(DuplexMode.Simplex);
    expect(result.targetDuplexMode).to.equal(TargetDuplexMode.Simplex);
  });

  it("should return Simplex when scanPlexMode is Simplex", () => {
    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: ScanPlexMode.Simplex,
    };
    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: false,
      event: makeEvent(),
    };
    const result = determineDuplexModes(
      destination,
      selectedScanTarget,
      DuplexMode.Simplex,
      undefined,
    );
    expect(result.duplexMode).to.equal(DuplexMode.Simplex);
    expect(result.targetDuplexMode).to.equal(TargetDuplexMode.Simplex);
  });

  it("should return Duplex when scanPlexMode is Duplex", () => {
    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: ScanPlexMode.Duplex,
    };
    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: false,
      event: makeEvent(),
    };
    const result = determineDuplexModes(
      destination,
      selectedScanTarget,
      DuplexMode.Simplex,
      undefined,
    );
    expect(result.duplexMode).to.equal(DuplexMode.Duplex);
    expect(result.targetDuplexMode).to.equal(TargetDuplexMode.Duplex);
  });

  it("should return FrontOfDoubleSided on first emulated duplex scan", () => {
    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: null,
    };
    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: true,
      event: makeEvent(),
    };
    const result = determineDuplexModes(
      destination,
      selectedScanTarget,
      DuplexMode.Simplex,
      undefined,
    );
    expect(result.duplexMode).to.equal(DuplexMode.FrontOfDoubleSided);
    expect(result.targetDuplexMode).to.equal(TargetDuplexMode.EmulatedDuplex);
  });

  it("should return BackOfDoubleSided on subsequent same-target emulated duplex", () => {
    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: null,
    };
    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: true,
      event: makeEvent(),
    };
    const lastScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: true,
      event: makeEvent(),
    };
    const result = determineDuplexModes(
      destination,
      selectedScanTarget,
      DuplexMode.FrontOfDoubleSided,
      lastScanTarget,
    );
    expect(result.duplexMode).to.equal(DuplexMode.BackOfDoubleSided);
    expect(result.targetDuplexMode).to.equal(TargetDuplexMode.EmulatedDuplex);
  });

  it("should return FrontOfDoubleSided when previous mode was BackOfDoubleSided", () => {
    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: null,
    };
    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: true,
      event: makeEvent(),
    };
    const lastScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: true,
      event: makeEvent(),
    };
    const result = determineDuplexModes(
      destination,
      selectedScanTarget,
      DuplexMode.BackOfDoubleSided,
      lastScanTarget,
    );
    expect(result.duplexMode).to.equal(DuplexMode.FrontOfDoubleSided);
    expect(result.targetDuplexMode).to.equal(TargetDuplexMode.EmulatedDuplex);
  });
});

describe("setupScanParameters", () => {
  let originalGetNextScanNumber: typeof PathHelper.getNextScanNumber;

  const scanConfig: ScanConfig = {
    resolution: 300,
    mode: ScanMode.Color,
    width: undefined,
    height: undefined,
    format: ScanFormat.Jpeg,
    directoryConfig: {
      directory: "/tmp",
      tempDirectory: "/tmp",
      filePattern: undefined,
    },
    paperlessConfig: undefined,
    nextcloudConfig: undefined,
    preferEscl: false,
    paperSize: undefined,
    paperDim: undefined,
    paperOrientation: undefined,
  };

  const saveJpegDestination: WalkupDestination = {
    shortcut: KnownShortcut.SaveJPEG,
    scanPlexMode: null,
  };

  const savePdfDestination: WalkupDestination = {
    shortcut: KnownShortcut.SavePDF,
    scanPlexMode: null,
  };

  beforeEach(() => {
    originalGetNextScanNumber = PathHelper.getNextScanNumber;
    PathHelper.getNextScanNumber = async (
      _folder: string,
      _currentScanCount: number,
      _filePattern: string | undefined,
    ) => 42;
  });

  afterEach(() => {
    PathHelper.getNextScanNumber = originalGetNextScanNumber;
  });

  it("should return Normal page counting and scanToPdf=false for Simplex with SaveJPEG", async () => {
    const result = await setupScanParameters(
      DuplexMode.Simplex,
      TargetDuplexMode.Simplex,
      saveJpegDestination,
      0,
      "/tmp",
      scanConfig,
      null,
    );

    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.Normal);
    expect(result.scanToPdf).to.be.false;
    expect(result.scanCount).to.equal(42);
  });

  it("should return Normal page counting for Duplex mode", async () => {
    const result = await setupScanParameters(
      DuplexMode.Duplex,
      TargetDuplexMode.Duplex,
      saveJpegDestination,
      0,
      "/tmp",
      scanConfig,
      null,
    );

    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.Normal);
    expect(result.scanToPdf).to.be.false;
    expect(result.scanCount).to.equal(42);
  });

  it("should return scanToPdf=true for Duplex with SavePDF destination", async () => {
    const result = await setupScanParameters(
      DuplexMode.Duplex,
      TargetDuplexMode.Duplex,
      savePdfDestination,
      0,
      "/tmp",
      scanConfig,
      null,
    );

    expect(result.scanToPdf).to.be.true;
    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.Normal);
    expect(result.scanCount).to.equal(42);
  });

  it("should return OddOnly for FrontOfDoubleSided emulated duplex", async () => {
    const result = await setupScanParameters(
      DuplexMode.FrontOfDoubleSided,
      TargetDuplexMode.EmulatedDuplex,
      saveJpegDestination,
      0,
      "/tmp",
      scanConfig,
      null,
    );

    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.OddOnly);
    expect(result.scanToPdf).to.be.false;
    expect(result.scanCount).to.equal(42);
  });

  it("should return EvenOnly and reuse context values for BackOfDoubleSided", async () => {
    const frontContext: FrontOfDoubleSidedScanContext = {
      scanConfig,
      folder: "/tmp",
      tempFolder: "/tmp",
      scanCount: 10,
      scanJobContent: { elements: [] },
      scanDate: new Date("2024-06-15"),
      scanToPdf: true,
    };

    const result = await setupScanParameters(
      DuplexMode.BackOfDoubleSided,
      TargetDuplexMode.EmulatedDuplex,
      saveJpegDestination,
      0,
      "/tmp",
      scanConfig,
      frontContext,
    );

    expect(result.pageCountingStrategy).to.equal(
      PageCountingStrategy.EvenOnly,
    );
    expect(result.scanToPdf).to.be.true;
    expect(result.scanCount).to.equal(10);
    expect(result.scanDate).to.equal(frontContext.scanDate);
  });
});

describe("handleScanResult", () => {
  const scanConfig: ScanConfig = {
    resolution: 300,
    mode: ScanMode.Color,
    width: undefined,
    height: undefined,
    format: ScanFormat.Jpeg,
    directoryConfig: {
      directory: "/tmp",
      tempDirectory: "/tmp",
      filePattern: undefined,
    },
    paperlessConfig: undefined,
    nextcloudConfig: undefined,
    preferEscl: false,
    paperSize: undefined,
    paperDim: undefined,
    paperOrientation: undefined,
  };

  const folder = "/tmp";
  const tempFolder = "/tmp";
  const scanCount = 1;
  const scanJobContent = createScanContent([
    { path: "page1.png", pageNumber: 1 },
  ]);
  const scanDate = new Date("2024-01-01");
  const scanToPdf = false;

  it("should create front of double-sided context for FrontOfDoubleSided", async () => {
    const result = await handleScanResult(
      DuplexMode.FrontOfDoubleSided,
      null,
      scanConfig,
      folder,
      tempFolder,
      scanCount,
      scanJobContent,
      scanDate,
      scanToPdf,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );

    expect(result).to.not.be.null;
    expect(result?.scanConfig).to.equal(scanConfig);
    expect(result?.folder).to.equal(folder);
    expect(result?.tempFolder).to.equal(tempFolder);
    expect(result?.scanCount).to.equal(scanCount);
    expect(result?.scanJobContent).to.equal(scanJobContent);
    expect(result?.scanDate).to.equal(scanDate);
    expect(result?.scanToPdf).to.equal(scanToPdf);
  });

  it("should call postProcessing and return null for Simplex mode", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "handleScanResult-simplex-"),
    );

    try {
      const jpegBytes = fs.readFileSync(
        path.join(__dirname, "asset/sample.jpg"),
      );
      const pagePath = path.join(tempDir, "page1.jpg");
      fs.writeFileSync(pagePath, jpegBytes);

      const result = await handleScanResult(
        DuplexMode.Simplex,
        null,
        scanConfig,
        tempDir,
        tempDir,
        1,
        createScanContent([{ path: pagePath, pageNumber: 1 }]),
        scanDate,
        true,
        DuplexAssemblyMode.DOCUMENT_WISE,
      );

      expect(result).to.be.null;
      const pdfPath = path.join(tempDir, "scan1.pdf");
      expect(fs.existsSync(pdfPath)).to.be.true;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should assemble duplex scan and call postProcessing for BackOfDoubleSided", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "handleScanResult-test-"));

    try {
      const jpegBytes = fs.readFileSync(
        path.join(__dirname, "asset/sample.jpg"),
      );
      const frontJpegPath = path.join(tempDir, "front1.jpg");
      const backJpegPath = path.join(tempDir, "back1.jpg");
      fs.writeFileSync(frontJpegPath, jpegBytes);
      fs.writeFileSync(backJpegPath, jpegBytes);

      const frontContext: FrontOfDoubleSidedScanContext = {
        scanConfig,
        folder: tempDir,
        tempFolder: tempDir,
        scanCount: 1,
        scanJobContent: createScanContent([
          { path: frontJpegPath, pageNumber: 1 },
        ]),
        scanDate,
        scanToPdf: true,
      };

      const backContent = createScanContent([
        { path: backJpegPath, pageNumber: 1 },
      ]);

      const result = await handleScanResult(
        DuplexMode.BackOfDoubleSided,
        frontContext,
        scanConfig,
        tempDir,
        tempDir,
        2,
        backContent,
        scanDate,
        true,
        DuplexAssemblyMode.DOCUMENT_WISE,
      );

      expect(result).to.equal(frontContext);
      const pdfPath = path.join(tempDir, "scan2.pdf");
      expect(fs.existsSync(pdfPath)).to.be.true;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("processFinishedPartialDuplexScan", () => {
  it("should call postProcessing with front context values and create a PDF", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "processFinished-test-"));

    try {
      const scanConfig: ScanConfig = {
        resolution: 300,
        mode: ScanMode.Color,
        width: undefined,
        height: undefined,
        format: ScanFormat.Jpeg,
        directoryConfig: {
          directory: tempDir,
          tempDirectory: tempDir,
          filePattern: undefined,
        },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        preferEscl: false,
        paperSize: undefined,
        paperDim: undefined,
        paperOrientation: undefined,
      };

      const jpegBytes = fs.readFileSync(
        path.join(__dirname, "asset/sample.jpg"),
      );
      const jpegPath = path.join(tempDir, "scan1_page1.jpg");
      fs.writeFileSync(jpegPath, jpegBytes);

      const frontContext: FrontOfDoubleSidedScanContext = {
        scanConfig,
        folder: tempDir,
        tempFolder: tempDir,
        scanCount: 1,
        scanJobContent: createScanContent([
          { path: jpegPath, pageNumber: 1 },
        ]),
        scanDate: new Date(),
        scanToPdf: true,
      };

      const lastScanTarget: SelectedScanTarget = {
        resourceURI: "/dest/1",
        label: "test",
        isDuplexSingleSide: true,
        event: makeEvent(),
      };

      const selectedScanTarget: SelectedScanTarget = {
        resourceURI: "/dest/2",
        label: "test2",
        isDuplexSingleSide: true,
        event: makeEvent({
          destinationURI: "/WalkupScan/Destinations/2",
        }),
      };

      await processFinishedPartialDuplexScan(
        lastScanTarget,
        selectedScanTarget,
        1,
        frontContext,
      );

      const pdfPath = path.join(tempDir, "scan1.pdf");
      expect(fs.existsSync(pdfPath)).to.be.true;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("processScanWithDestination", () => {
  let tempDir: string;
  let originalIsAlive: typeof HPApi.isAlive;
  let originalDelay: typeof HPApi.delay;
  let originalGetNextScanNumber: typeof PathHelper.getNextScanNumber;

  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.disableNetConnect();
    HPApi.setDeviceIP("127.0.0.1");
    originalIsAlive = HPApi.isAlive;
    originalDelay = HPApi.delay;
    originalGetNextScanNumber = PathHelper.getNextScanNumber;
    HPApi.isAlive = async () => true;
    HPApi.delay = async () => {
      /* no-op */
    };
    PathHelper.getNextScanNumber = async (
      _folder: string,
      currentScanCount: number,
      _filePattern: string | undefined,
    ) => currentScanCount + 1;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "processScan-test-"));
  });

  afterEach(() => {
    HPApi.isAlive = originalIsAlive;
    HPApi.delay = originalDelay;
    PathHelper.getNextScanNumber = originalGetNextScanNumber;
    nock.cleanAll();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should perform a Simplex scan and return the result", async () => {
    const processingXml = `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Processing</j:JobState>
  <ScanJob>
    <PreScanPage>
      <PageState>ReadyToUpload</PageState>
      <BinaryURL>/Scan/Jobs/123/Pages/1</BinaryURL>
      <PageNumber>1</PageNumber>
      <BufferInfo>
        <ImageWidth>100</ImageWidth>
        <ImageHeight>200</ImageHeight>
        <ScanSettings>
          <InputSource>Platen</InputSource>
          <ContentType>Photo</ContentType>
          <XResolution>300</XResolution>
          <YResolution>300</YResolution>
        </ScanSettings>
      </BufferInfo>
    </PreScanPage>
  </ScanJob>
</j:Job>`;

    const completedXml = `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Completed</j:JobState>
  <ScanJob>
    <PostScanPage>
      <PageNumber>1</PageNumber>
    </PostScanPage>
  </ScanJob>
</j:Job>`;

    const jobScope = nock("http://127.0.0.1:8080");

    // Calls 1 & 2: getJob in hpScanJobHandling and waitDeviceUntilItIsReadyToUploadOrCompleted
    jobScope.get("/Scan/Jobs/123").times(2).reply(200, processingXml);

    // Call 3: downloadPage binary
    jobScope
      .get("/Scan/Jobs/123/Pages/1")
      .reply(200, Buffer.from("fake-image-data"), {
        "Content-Type": "image/jpeg",
      });

    // Call 4: getJob after page processing
    jobScope.get("/Scan/Jobs/123").reply(200, completedXml);

    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: null,
    };

    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "test",
      isDuplexSingleSide: false,
      event: makeEvent(),
    };

    const scanConfig = createDefaultScanConfig(tempDir);

    const mockDeviceCapabilities = createMockDeviceCapabilities();

    const result = await processScanWithDestination(
      destination,
      selectedScanTarget,
      DuplexMode.Simplex,
      undefined,
      tempDir,
      tempDir,
      scanConfig,
      mockDeviceCapabilities,
      0,
      null,
    );

    expect(result.duplexMode).to.equal(DuplexMode.Simplex);
    expect(result.scanCount).to.equal(1);
    expect(result.frontOfDoubleSidedScanContext).to.be.null;
    expect(jobScope.isDone()).to.be.true;
  });

  it("should call processFinishedPartialDuplexScan when switching from emulated front to simplex", async () => {
    const processingXml = `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Processing</j:JobState>
  <ScanJob>
    <PreScanPage>
      <PageState>ReadyToUpload</PageState>
      <BinaryURL>/Scan/Jobs/123/Pages/1</BinaryURL>
      <PageNumber>1</PageNumber>
      <BufferInfo>
        <ImageWidth>100</ImageWidth>
        <ImageHeight>200</ImageHeight>
        <ScanSettings>
          <InputSource>Platen</InputSource>
          <ContentType>Photo</ContentType>
          <XResolution>300</XResolution>
          <YResolution>300</YResolution>
        </ScanSettings>
      </BufferInfo>
    </PreScanPage>
  </ScanJob>
</j:Job>`;

    const completedXml = `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Completed</j:JobState>
  <ScanJob>
    <PostScanPage>
      <PageNumber>1</PageNumber>
    </PostScanPage>
  </ScanJob>
</j:Job>`;

    const jobScope = nock("http://127.0.0.1:8080");

    jobScope.get("/Scan/Jobs/123").times(2).reply(200, processingXml);

    jobScope
      .get("/Scan/Jobs/123/Pages/1")
      .reply(200, Buffer.from("fake-image-data"), {
        "Content-Type": "image/jpeg",
      });

    jobScope.get("/Scan/Jobs/123").reply(200, completedXml);

    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: null,
    };

    const jpegBytes = fs.readFileSync(
      path.join(__dirname, "asset/sample.jpg"),
    );
    const frontJpegPath = path.join(tempDir, "front.jpg");
    fs.writeFileSync(frontJpegPath, jpegBytes);

    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/2",
      label: "next",
      isDuplexSingleSide: false,
      event: makeEvent(),
    };

    const lastScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "prev",
      isDuplexSingleSide: true,
      event: makeEvent(),
    };

    const frontContext: FrontOfDoubleSidedScanContext = {
      scanConfig: createDefaultScanConfig(tempDir),
      folder: tempDir,
      tempFolder: tempDir,
      scanCount: 0,
      scanJobContent: createScanContent([
        { path: frontJpegPath, pageNumber: 1 },
      ]),
      scanDate: new Date(),
      scanToPdf: true,
    };

    const scanConfig = createDefaultScanConfig(tempDir);

    const mockDeviceCapabilities = createMockDeviceCapabilities();

    const result = await processScanWithDestination(
      destination,
      selectedScanTarget,
      DuplexMode.FrontOfDoubleSided,
      lastScanTarget,
      tempDir,
      tempDir,
      scanConfig,
      mockDeviceCapabilities,
      1,
      frontContext,
    );

    expect(result.duplexMode).to.equal(DuplexMode.Simplex);
    expect(result.scanCount).to.equal(2);
    expect(jobScope.isDone()).to.be.true;
    expect(fs.existsSync(path.join(tempDir, "scan0.pdf"))).to.be.true;
  });

  it("should call processFinishedPartialDuplexScan when switching from emulated front to duplex", async () => {
    const processingXml = `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Processing</j:JobState>
  <ScanJob>
    <PreScanPage>
      <PageState>ReadyToUpload</PageState>
      <BinaryURL>/Scan/Jobs/123/Pages/1</BinaryURL>
      <PageNumber>1</PageNumber>
      <BufferInfo>
        <ImageWidth>100</ImageWidth>
        <ImageHeight>200</ImageHeight>
        <ScanSettings>
          <InputSource>Platen</InputSource>
          <ContentType>Photo</ContentType>
          <XResolution>300</XResolution>
          <YResolution>300</YResolution>
        </ScanSettings>
      </BufferInfo>
    </PreScanPage>
  </ScanJob>
</j:Job>`;

    const completedXml = `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Completed</j:JobState>
  <ScanJob>
    <PostScanPage>
      <PageNumber>1</PageNumber>
    </PostScanPage>
  </ScanJob>
</j:Job>`;

    const jobScope = nock("http://127.0.0.1:8080");

    jobScope.get("/Scan/Jobs/123").times(2).reply(200, processingXml);

    jobScope
      .get("/Scan/Jobs/123/Pages/1")
      .reply(200, Buffer.from("fake-image-data"), {
        "Content-Type": "image/jpeg",
      });

    jobScope.get("/Scan/Jobs/123").reply(200, completedXml);

    const destination: WalkupDestination = {
      shortcut: KnownShortcut.SaveJPEG,
      scanPlexMode: ScanPlexMode.Duplex,
    };

    const jpegBytes = fs.readFileSync(
      path.join(__dirname, "asset/sample.jpg"),
    );
    const frontJpegPath = path.join(tempDir, "front.jpg");
    fs.writeFileSync(frontJpegPath, jpegBytes);

    const selectedScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/2",
      label: "next",
      isDuplexSingleSide: false,
      event: makeEvent(),
    };

    const lastScanTarget: SelectedScanTarget = {
      resourceURI: "/WalkupScan/Destinations/1",
      label: "prev",
      isDuplexSingleSide: true,
      event: makeEvent(),
    };

    const frontContext: FrontOfDoubleSidedScanContext = {
      scanConfig: createDefaultScanConfig(tempDir),
      folder: tempDir,
      tempFolder: tempDir,
      scanCount: 0,
      scanJobContent: createScanContent([
        { path: frontJpegPath, pageNumber: 1 },
      ]),
      scanDate: new Date(),
      scanToPdf: true,
    };

    const scanConfig = createDefaultScanConfig(tempDir);

    const mockDeviceCapabilities = createMockDeviceCapabilities();

    const result = await processScanWithDestination(
      destination,
      selectedScanTarget,
      DuplexMode.FrontOfDoubleSided,
      lastScanTarget,
      tempDir,
      tempDir,
      scanConfig,
      mockDeviceCapabilities,
      1,
      frontContext,
    );

    expect(result.duplexMode).to.equal(DuplexMode.Duplex);
    expect(result.scanCount).to.equal(2);
    expect(jobScope.isDone()).to.be.true;
    expect(fs.existsSync(path.join(tempDir, "scan0.pdf"))).to.be.true;
  });
});
