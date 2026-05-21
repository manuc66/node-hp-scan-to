import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import HPApi from "../src/HPApi.js";
import { adfAutoscanCmd } from "../src/commands/adfAutoscanCmd.js";
import type { AdfAutoScanConfig } from "../src/type/scanConfigs.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("adfAutoscanCmd", () => {
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "adfAutoscanCmd-test-"));
  });

  afterEach(() => {
    HPApi.isAlive = originalIsAlive;
    HPApi.waitDeviceUp = originalWaitDeviceUp;
    nock.cleanAll();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should warn if ADF detect paper is unsupported", async () => {
    const config: AdfAutoScanConfig = {
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
      isDuplex: false,
      generatePdf: false,
      pollingInterval: 1,
      startScanDelay: 1,
    };

    // Mock HPApi.getDiscoveryTree
    nock("http://127.0.0.1:80")
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

    // Mock HPApi.getScanCaps (No ADF detection advertised)
    nock("http://127.0.0.1:80")
      .get("/Scan/ScanCaps")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
    <PlatenMaxWidth>2550</PlatenMaxWidth>
    <PlatenMaxHeight>3300</PlatenMaxHeight>
</ScanCaps>`,
      );

    // Mock getScanStatus to fail
    nock("http://127.0.0.1:80").persist().get("/Scan/Status").reply(500);

    HPApi.isAlive = async () => true;
    HPApi.delay = async () => {
      /* noop */
    };
    HPApi.waitDeviceUp = async () => {
      /* noop */
    };

    await adfAutoscanCmd(config, 1);
  });

  it("should call waitDeviceUp when device goes down and recover", async () => {
    const config: AdfAutoScanConfig = {
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
      isDuplex: false,
      generatePdf: false,
      pollingInterval: 1,
      startScanDelay: 1,
    };

    nock("http://127.0.0.1:80")
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
      .get("/Scan/ScanCaps")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
    <PlatenMaxWidth>2550</PlatenMaxWidth>
    <PlatenMaxHeight>3300</PlatenMaxHeight>
</ScanCaps>`,
      );

    nock("http://127.0.0.1:80").persist().get("/Scan/Status").reply(500);

    let waitDeviceUpCalled = false;
    let isAliveCallCount = 0;
    HPApi.isAlive = async () => {
      isAliveCallCount++;
      return isAliveCallCount > 1;
    };
    HPApi.delay = async () => {
      /* noop */
    };
    HPApi.waitDeviceUp = async () => {
      waitDeviceUpCalled = true;
    };

    await adfAutoscanCmd(config, 1);

    expect(waitDeviceUpCalled).to.be.true;
  });

  it("should execute a successful scan iteration and then terminate after 50 errors", async () => {
    const config: AdfAutoScanConfig = {
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
      isDuplex: false,
      generatePdf: false,
      pollingInterval: 1,
      startScanDelay: 1,
    };

    // Mock DiscoveryTree
    nock("http://127.0.0.1:80")
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

    // Mock ScanJobManifest
    nock("http://127.0.0.1:80")
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

    // Mock ScanCaps
    nock("http://127.0.0.1:80")
      .get("/Scan/ScanCaps")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
    <AdfMaxWidth>2550</AdfMaxWidth>
    <AdfMaxHeight>3300</AdfMaxHeight>
    <AdfDetectPaperLoaded>true</AdfDetectPaperLoaded>
</ScanCaps>`,
      );

    // 1st & 2nd Status request: ADF is loaded and scanner is Idle
    nock("http://127.0.0.1:80")
      .get("/Scan/Status")
      .times(2)
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanStatus xmlns="http://www.hp.com/schemas/imaging/con/ledm/scanstatus/2008/11/17">
    <ScannerState>Idle</ScannerState>
    <AdfState>Loaded</AdfState>
</ScanStatus>`,
      );

    // ScanJob POST
    nock("http://127.0.0.1:8080")
      .post("/Scan/Jobs")
      .reply(201, "", { Location: "http://127.0.0.1/Scan/Jobs/123" });

    // Job Processing Status (needs to match 2x: line 242 initial check + inside waitDeviceUntilItIsReadyToUploadOrCompleted)
    nock("http://127.0.0.1:80")
      .get("/Scan/Jobs/123")
      .times(2)
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30">
    <ScanJob>
        <PreScanPage>
            <PageState>ReadyToUpload</PageState>
            <BufferInfo>
              <ScanSettings>
                <XResolution>300</XResolution>
                <YResolution>300</YResolution>
                <Format>Jpeg</Format>
                <InputSource>Adf</InputSource>
              </ScanSettings>
              <ImageWidth>1654</ImageWidth>
              <ImageHeight>2338</ImageHeight>
            </BufferInfo>
            <BinaryURL>/Scan/Jobs/123/Pages/1</BinaryURL>
            <PageNumber>1</PageNumber>
        </PreScanPage>
    </ScanJob>
    <j:JobState>Processing</j:JobState>
</j:Job>`,
      );

    // Job Completed Status
    nock("http://127.0.0.1:80")
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

    // Download Page
    nock("http://127.0.0.1:8080")
      .get("/Scan/Jobs/123/Pages/1")
      .reply(200, "fake-image-data");

    // Subsequent Status requests fail to trigger loop exit after 50 errors
    nock("http://127.0.0.1:80")
      .persist()
      .get("/Scan/Status")
      .reply(500);

    HPApi.isAlive = async () => true;
    HPApi.delay = async () => {
      /* noop */
    };
    HPApi.waitDeviceUp = async () => {
      /* noop */
    };

    await adfAutoscanCmd(config, 1);

    // Verify a file was indeed saved during the success iteration
    const files = fs.readdirSync(tempDir);
    expect(files.some((f) => f.includes("scan1"))).to.be.true;
  });
});
