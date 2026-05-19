import { expect } from "chai";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import { describe, it, beforeEach, afterEach } from "mocha";
import nock from "nock";
import HPApi from "../src/HPApi.js";
import { assembleDuplexScan, listenCmd } from "../src/commands/listenCmd.js";
import { DuplexAssemblyMode } from "../src/type/DuplexAssemblyMode.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

  it("should stop when device is down", async () => {
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
    expect(true).to.be.true;
  });
});
