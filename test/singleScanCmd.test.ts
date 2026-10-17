import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import DeviceClient from "../src/DeviceClient.js";
import { singleScanCmd } from "../src/commands/singleScanCmd.js";
import type { SingleScanConfig } from "../src/type/scanConfigs.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("singleScanCmd", () => {
  let tempDir: string;
  let api: DeviceClient;

  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    if (!nock.isDone()) {
      const pending = nock.pendingMocks();
      nock.cleanAll();
      throw new Error(`Test left pending nock mocks:\n${pending.join("\n")}`);
    }

    nock.disableNetConnect();
    api = new DeviceClient("127.0.0.1", false);
    api.isAlive = async () => true;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "singleScanCmd-test-"));
  });

  afterEach(() => {
    nock.cleanAll();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should execute single scan", async () => {
    const config: SingleScanConfig = {
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
      s3Config: undefined,
      preferEscl: false,
      paperSize: undefined,
      paperDim: undefined,
      paperOrientation: undefined,
      isDuplex: false,
      generatePdf: false,
    };

    // Mock DeviceClient.getDiscoveryTree
    nock("http://127.0.0.1")
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

    // Mock DeviceClient.getScanJobManifest
    nock("http://127.0.0.1")
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

    // Mock DeviceClient.getScanCaps
    nock("http://127.0.0.1")
      .get("/Scan/ScanCaps")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
    <PlatenMaxWidth>2550</PlatenMaxWidth>
    <PlatenMaxHeight>3300</PlatenMaxHeight>
</ScanCaps>`,
      );

    // Mock DeviceClient.getScanStatus
    nock("http://127.0.0.1")
      .get("/Scan/Status")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanStatus xmlns="http://www.hp.com/schemas/imaging/con/ledm/scanstatus/2008/11/17">
    <ScannerState>Idle</ScannerState>
    <AdfState>Empty</AdfState>
</ScanStatus>`,
      );

    // Mock DeviceClient.postJob
    nock("http://127.0.0.1:8080")
      .post("/Scan/Jobs")
      .reply(201, "", { Location: "http://127.0.0.1/Scan/Jobs/123" });

    // Mock DeviceClient.getJob (Processing)
    nock("http://127.0.0.1")
      .get("/Scan/Jobs/123")
      .times(3)
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30">
    <ScanJob>
        <PreScanPage>
            <PageState>ReadyToUpload</PageState>
            <BufferInfo>
              <ScanSettings>
                <XResolution>200</XResolution>
                <YResolution>200</YResolution>
                <XStart>33</XStart>
                <YStart>0</YStart>
                <Width>2481</Width>
                <Height>3507</Height>
                <Format>Jpeg</Format>
                <CompressionQFactor>0</CompressionQFactor>
                <ColorSpace>Color</ColorSpace>
                <BitDepth>8</BitDepth>
                <InputSource>Adf</InputSource>
                <ContentType>Document</ContentType>
              </ScanSettings>
              <ImageWidth>1654</ImageWidth>
              <ImageHeight>2338</ImageHeight>
              <BytesPerLine>4962</BytesPerLine>
              <Cooked>enabled</Cooked>
            </BufferInfo>
            <BinaryURL>/Scan/Jobs/123/Pages/1</BinaryURL>
            <PageNumber>1</PageNumber>
        </PreScanPage>
    </ScanJob>
    <j:JobState>Processing</j:JobState>
</j:Job>`,
      );

    // Mock DeviceClient.getJob (Completed)
    nock("http://127.0.0.1")
      .get("/Scan/Jobs/123")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30">
    <ScanJob>
        <PostScanPage>
            <PageNumber>1</PageNumber>
        </PostScanPage>
    </ScanJob>
    <j:JobState>Completed</j:JobState>
</j:Job>`,
      );

    // Mock DeviceClient.downloadPage
    nock("http://127.0.0.1:8080")
      .get("/Scan/Jobs/123/Pages/1")
      .reply(200, "fake-image-data");

    await singleScanCmd(api, config, 1);

    // Check if file was created in tempDir
    const files = fs.readdirSync(tempDir);
    console.log("Files in tempDir:", files);
    expect(files.some((f) => f.includes("scan0"))).to.be.true;
  });
});
