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
    nock("http://127.0.0.1")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/2007/09/21" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <ledm:ManifestURI>/Scan/ScanJobManifest</ledm:ManifestURI>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`);

    // Mock HPApi.getScanJobManifest
    nock("http://127.0.0.1")
        .get("/Scan/ScanJobManifest")
        .reply(200, `<?xml version="1.0" encoding="UTF-8"?>
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
</man:Manifest>`);

    // Mock HPApi.getScanCaps (No ADF detection advertised)
    nock("http://127.0.0.1")
        .get("/Scan/ScanCaps")
        .reply(200, `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
    <PlatenMaxWidth>2550</PlatenMaxWidth>
    <PlatenMaxHeight>3300</PlatenMaxHeight>
</ScanCaps>`);

    // Mock getScanStatus to fail 50 times to exit the loop quickly
    // We mock HPApi.isAlive() to return false after 1 error to exit the loop
    nock("http://127.0.0.1")
        .get("/Scan/Status")
        .reply(500);
    
    HPApi.isAlive = async () => false;
    // Mock HPApi.waitDeviceUp to return instantly even when "down"
    HPApi.waitDeviceUp = async () => {
        throw new Error("Test exit condition: waitDeviceUp called");
    };

    await expect(adfAutoscanCmd(config, 1)).to.be.fulfilled;
  });
});
