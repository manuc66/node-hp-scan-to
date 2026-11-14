import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import { AxiosError } from "axios";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readDeviceCapabilities,
  readDeviceCapabilitiesWithRetry,
} from "../src/readDeviceCapabilities.js";
import { DeviceNotReadyError } from "../src/type/DeviceNotReadyError.js";
import DeviceClient from "../src/DeviceClient.js";
import { InputSource } from "../src/type/InputSource.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import { createImageFormat } from "../src/imageFormats/index.js";
import EsclWalkupScanListener from "../src/scanListeners/EsclWalkupScanListener.js";
import HpWalkupScanListener from "../src/scanListeners/HpWalkupScanListener.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("readDeviceCapabilities", () => {
  let api: DeviceClient;

  beforeEach(() => {
    api = new DeviceClient("127.0.0.1");
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  afterEach(() => {
    nock.cleanAll();
    nock.restore();
    nock.activate();
  });

  it("reads device capabilities for a simple device (no eSCL, no WalkupScan)", async () => {
    nock("http://127.0.0.1")
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
    <ledm:ManifestURI>/Scan/ScanJobManifest.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
      );

    nock("http://127.0.0.1")
      .get("/Scan/ScanJobManifest.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/04/30" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/resourcemap/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scanjobmanifest/2009/04/30">
  <map:ResourceMap>
    <map:ResourceLink>
      <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
    </map:ResourceLink>
    <map:ResourceNode>
      <map:ResourceType>
        <scan:ScanResourceType>ScanCaps</scan:ScanResourceType>
      </map:ResourceType>
      <map:ResourceLink>
        <dd:ResourceURI>/Scan/ScanCaps.xml</dd:ResourceURI>
      </map:ResourceLink>
    </map:ResourceNode>
  </map:ResourceMap>
</man:Manifest>`,
      );

    nock("http://127.0.0.1")
      .get("/Scan/ScanCaps.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2009/03/23">
  <Platen>
    <InputSourceCaps>
      <MaxWidth>2550</MaxWidth>
      <MaxHeight>3300</MaxHeight>
    </InputSourceCaps>
  </Platen>
</ScanCaps>`,
      );

    const caps = await readDeviceCapabilities(api, false, true);

    expect(caps.platenMaxWidth).to.equal(2550);
    expect(caps.platenMaxHeight).to.equal(3300);
    expect(caps.isEscl).to.be.false;
    expect(caps.createWalkupScanListener?.(api, [])).to.be.instanceOf(
      HpWalkupScanListener,
    );
  });

  it("exposes the HP WalkupScan listener for devices advertising that manifest", async () => {
    const walkupScanManifest = await fs.readFile(
      path.resolve(__dirname, "./asset/walkupScanManifest.xml"),
      "utf8",
    );

    nock("http://127.0.0.1")
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>hpCnxWalkupScanManifest</dd:ResourceType>
    <ledm:ManifestURI>/WalkupScan/WalkupScanManifest.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
      );
    nock("http://127.0.0.1")
      .get("/WalkupScan/WalkupScanManifest.xml")
      .reply(200, walkupScanManifest);

    const caps = await readDeviceCapabilities(api, false, true);

    expect(caps.createWalkupScanListener?.(api, [])).to.be.instanceOf(
      HpWalkupScanListener,
    );
  });

  it("auto-detects eSCL walkup when the tree advertises eSCL, without --prefer-eSCL", async () => {
    nock("http://127.0.0.1")
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>eSCL:eSclManifest</dd:ResourceType>
    <ledm:ManifestURI>/eSCL/eSclManifest.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
      );

    nock("http://127.0.0.1")
      .get("/eSCL/eSclManifest.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/04/30" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/resourcemap/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scanjobmanifest/2009/04/30">
  <map:ResourceMap>
    <map:ResourceLink>
      <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
    </map:ResourceLink>
    <map:ResourceNode>
      <map:ResourceType>
        <scan:ScanResourceType>ScannerCapabilities</scan:ScanResourceType>
      </map:ResourceType>
      <map:ResourceLink>
        <dd:ResourceURI>/eSCL/ScannerCapabilities.xml</dd:ResourceURI>
      </map:ResourceLink>
    </map:ResourceNode>
  </map:ResourceMap>
</man:Manifest>`,
      );

    nock("http://127.0.0.1")
      .get("/eSCL/ScannerCapabilities.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MaxHeight>3508</scan:MaxHeight>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`,
      );

    nock("http://127.0.0.1")
      .get("/eSCL/ScannerStatus")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:State>Idle</pwg:State>
</scan:ScannerStatus>`,
      );
    nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(200);

    const caps = await readDeviceCapabilities(api, false, true);

    expect(caps.isEscl).to.be.true;
    expect(caps.createWalkupScanListener?.(api, [])).to.be.instanceOf(
      EsclWalkupScanListener,
    );
  });

  it("detects eSCL support when preferred", async () => {
    nock("http://127.0.0.1")
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>eSCL:eSclManifest</dd:ResourceType>
    <ledm:ManifestURI>/eSCL/eSclManifest.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
      );

    nock("http://127.0.0.1")
      .get("/eSCL/eSclManifest.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/04/30" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/resourcemap/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scanjobmanifest/2009/04/30">
  <map:ResourceMap>
    <map:ResourceLink>
      <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
    </map:ResourceLink>
    <map:ResourceNode>
      <map:ResourceType>
        <scan:ScanResourceType>ScannerCapabilities</scan:ScanResourceType>
      </map:ResourceType>
      <map:ResourceLink>
        <dd:ResourceURI>/eSCL/ScannerCapabilities.xml</dd:ResourceURI>
      </map:ResourceLink>
    </map:ResourceNode>
  </map:ResourceMap>
</man:Manifest>`,
      );

    nock("http://127.0.0.1")
      .get("/eSCL/ScannerCapabilities.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MaxHeight>3508</scan:MaxHeight>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`,
      );

    nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(200);

    const caps = await readDeviceCapabilities(api, true, true);

    expect(caps.isEscl).to.be.true;
    expect(caps.createWalkupScanListener?.(api, [])).to.be.instanceOf(
      EsclWalkupScanListener,
    );
    expect(caps.platenMaxWidth).to.equal(2550);
    expect(caps.platenMaxHeight).to.equal(3508);

    nock("http://127.0.0.1")
      .get("/eSCL/ScannerStatus")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:State>Idle</pwg:State>
</scan:ScannerStatus>`,
      );

    const status = await caps.getScanStatus();
    expect(status).to.not.be.null;

    const jobSettings = caps.createScanJobSettings(
      InputSource.Adf,
      "Document",
      createImageFormat(ScanFormat.Bmp),
      300,
      ScanMode.Gray,
      1000,
      2000,
      false,
    );
    expect(jobSettings).to.not.be.null;

    nock("http://127.0.0.1").post("/eSCL/ScanJobs").reply(201, "", {
      Location: "http://127.0.0.1/eSCL/ScanJobs/1",
    });

    const jobUrl = await caps.submitScanJob(jobSettings);
    expect(jobUrl).to.equal("http://127.0.0.1/eSCL/ScanJobs/1");
  });

  it("handles walkup scan capabilities", async () => {
    nock("http://127.0.0.1")
      .get("/DevMgmt/DiscoveryTree.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>ledm:hpLedmWalkupScanToCompManifest</dd:ResourceType>
    <ledm:ManifestURI>/WalkupScanToComp/WalkupScanToCompManifest.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
      );

    nock("http://127.0.0.1")
      .get("/WalkupScanToComp/WalkupScanToCompManifest.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/04/30" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/resourcemap/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscantocompmanifest/2009/03/12">
  <map:ResourceMap>
    <map:ResourceLink>
      <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
    </map:ResourceLink>
    <map:ResourceNode>
      <map:ResourceType>
        <wus:WalkupScanToCompResourceType>WalkupScanToCompCaps</wus:WalkupScanToCompResourceType>
      </map:ResourceType>
      <map:ResourceLink>
        <dd:ResourceURI>/WalkupScanToComp/WalkupScanToCompCaps.xml</dd:ResourceURI>
      </map:ResourceLink>
    </map:ResourceNode>
  </map:ResourceMap>
</man:Manifest>`,
      );

    nock("http://127.0.0.1")
      .get("/WalkupScanToComp/WalkupScanToCompCaps.xml")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanToCompCaps xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscantocompcaps/2009/03/12">
  <wus:SupportsMultiItemScanFromPlaten>true</wus:SupportsMultiItemScanFromPlaten>
</wus:WalkupScanToCompCaps>`,
      );

    const caps = await readDeviceCapabilities(api, false, true);

    expect(caps.createWalkupScanListener?.(api, [])).to.be.instanceOf(
      HpWalkupScanListener,
    );
    expect(caps.supportsMultiItemScanFromPlaten).to.be.true;
  });

  it("falls back to well-known eSCL capabilities when DiscoveryTree.xml returns 404", async () => {
    // Newer HP firmware omits /DevMgmt/DiscoveryTree.xml entirely; the
    // device serves only the standard eSCL endpoints on port 80.
    nock("http://127.0.0.1").get("/DevMgmt/DiscoveryTree.xml").reply(404);

    nock("http://127.0.0.1")
      .get("/eSCL/ScannerCapabilities")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MaxHeight>3508</scan:MaxHeight>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`,
      );

    nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(200);

    const caps = await readDeviceCapabilities(api, true, true);

    expect(caps.isEscl).to.be.true;
    expect(caps.createWalkupScanListener?.(api, [])).to.be.instanceOf(
      EsclWalkupScanListener,
    );
    expect(caps.platenMaxWidth).to.equal(2550);
    expect(caps.platenMaxHeight).to.equal(3508);
  });

  it("auto-detects eSCL when DiscoveryTree.xml is absent, without --prefer-eSCL", async () => {
    nock("http://127.0.0.1").get("/DevMgmt/DiscoveryTree.xml").reply(404);
    nock("http://127.0.0.1")
      .get("/eSCL/ScanCapabilities")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MaxHeight>3508</scan:MaxHeight>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`,
      );

    nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(200);

    const caps = await readDeviceCapabilities(api, false, true);

    expect(caps.isEscl).to.be.true;
    expect(caps.createWalkupScanListener?.(api, [])).to.be.instanceOf(
      EsclWalkupScanListener,
    );
  });

  it("does not expose walkup when the eSCL device has no walkup endpoint", async () => {
    nock("http://127.0.0.1").get("/DevMgmt/DiscoveryTree.xml").reply(404);
    nock("http://127.0.0.1")
      .get("/eSCL/ScanCapabilities")
      .reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MaxHeight>3508</scan:MaxHeight>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`,
      );
    nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(404);

    const caps = await readDeviceCapabilities(api, false, true);

    expect(caps.isEscl).to.be.true;
    expect(caps.createWalkupScanListener).to.be.null;
  });

  it("fails when DiscoveryTree.xml answers an unexpected status (e.g. 500)", async () => {
    // Only 404/405 mean "no HP-proprietary tree"; any other status is a
    // real error and must not be silently swallowed into an eSCL fallback.
    nock("http://127.0.0.1").get("/DevMgmt/DiscoveryTree.xml").reply(500);

    let caught: unknown;
    try {
      await readDeviceCapabilities(api, true);
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(Error);
    expect((caught as Error).message).to.match(/status 500/);
  });

  describe("capability detection retry", () => {
    const unrelatedTree = `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>ledm:hpLedmPrintConfigCap</dd:ResourceType>
    <ledm:ManifestURI>/Print/Config.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`;

    const idleStatus = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:State>Idle</pwg:State>
</scan:ScannerStatus>`;

    const scannerCaps = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MaxHeight>3508</scan:MaxHeight>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`;

    it("retries while the printer services are not ready", async () => {
      nock("http://127.0.0.1")
        .get("/DevMgmt/DiscoveryTree.xml")
        .times(2)
        .reply(200, unrelatedTree);
      nock("http://127.0.0.1").get("/eSCL/ScannerStatus").reply(200, idleStatus);
      nock("http://127.0.0.1").get("/eSCL/ScanCapabilities").reply(403);
      nock("http://127.0.0.1").get("/eSCL/ScannerCapabilities").reply(403);
      nock("http://127.0.0.1")
        .get("/eSCL/ScanCapabilities")
        .reply(200, scannerCaps);
      nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(404);

      const caps = await readDeviceCapabilitiesWithRetry(api, false, true, {
        timeoutMs: 2000,
        retryDelayMs: 1,
      });

      expect(caps.isEscl).to.be.true;
      expect(caps.platenMaxWidth).to.equal(2550);
      expect(caps.createWalkupScanListener).to.be.null;
      expect(nock.isDone()).to.be.true;
    });

    it("gives up with DeviceNotReadyError after the retry window", async () => {
      nock("http://127.0.0.1")
        .persist()
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, unrelatedTree);
      nock("http://127.0.0.1")
        .persist()
        .get("/eSCL/ScannerStatus")
        .reply(200, idleStatus);
      nock("http://127.0.0.1")
        .persist()
        .get("/eSCL/ScanCapabilities")
        .reply(403);
      nock("http://127.0.0.1")
        .persist()
        .get("/eSCL/ScannerCapabilities")
        .reply(403);

      let caught: unknown;
      try {
        await readDeviceCapabilitiesWithRetry(api, false, true, {
          timeoutMs: 40,
          retryDelayMs: 5,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).to.be.instanceOf(DeviceNotReadyError);
    });


    it("retries an AxiosError from a secondary probe", async () => {
      nock("http://127.0.0.1")
        .persist()
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
    <ledm:ManifestURI>/Scan/ScanJobManifest.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
        );
      nock("http://127.0.0.1")
        .persist()
        .get("/Scan/ScanJobManifest.xml")
        .reply(403);

      let caught: unknown;
      try {
        await readDeviceCapabilitiesWithRetry(api, false, false, {
          timeoutMs: 30,
          retryDelayMs: 5,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).to.be.instanceOf(AxiosError);
      expect((caught as AxiosError).status).to.equal(403);
    });
    it("does not retry permanent detection errors", async () => {
      nock("http://127.0.0.1")
        .get("/DevMgmt/DiscoveryTree.xml")
        .once()
        .reply(400);

      let caught: unknown;
      try {
        await readDeviceCapabilitiesWithRetry(api, false, true, {
          timeoutMs: 2000,
          retryDelayMs: 1,
        });
      } catch (error) {
        caught = error;
      }

      expect((caught as Error).message).to.match(/status 400/);
      expect(nock.isDone()).to.be.true;
    });

    it("keeps the legacy fallback when a preferred eSCL probe is not ready", async () => {
      nock("http://127.0.0.1")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
    <ledm:ManifestURI>/Scan/ScanJobManifest.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
        );
      nock("http://127.0.0.1")
        .get("/Scan/ScanJobManifest.xml")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/04/30" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/resourcemap/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scanjobmanifest/2009/04/30">
  <map:ResourceMap>
    <map:ResourceLink>
      <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
    </map:ResourceLink>
    <map:ResourceNode>
      <map:ResourceType>
        <scan:ScanResourceType>ScanCaps</scan:ScanResourceType>
      </map:ResourceType>
      <map:ResourceLink>
        <dd:ResourceURI>/Scan/ScanCaps.xml</dd:ResourceURI>
      </map:ResourceLink>
    </map:ResourceNode>
  </map:ResourceMap>
</man:Manifest>`,
        );
      nock("http://127.0.0.1")
        .get("/Scan/ScanCaps.xml")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2009/03/23">
  <Platen>
    <InputSourceCaps>
      <MaxWidth>2550</MaxWidth>
      <MaxHeight>3300</MaxHeight>
    </InputSourceCaps>
  </Platen>
</ScanCaps>`,
        );
      nock("http://127.0.0.1").get("/eSCL/ScannerStatus").reply(200, idleStatus);
      nock("http://127.0.0.1").get("/eSCL/ScanCapabilities").reply(403);
      nock("http://127.0.0.1").get("/eSCL/ScannerCapabilities").reply(403);

      const caps = await readDeviceCapabilitiesWithRetry(api, true, true, {
        timeoutMs: 2000,
        retryDelayMs: 1,
      });

      expect(caps.isEscl).to.be.false;
      expect(caps.platenMaxWidth).to.equal(2550);
      expect(caps.createWalkupScanListener?.(api, [])).to.be.instanceOf(
        HpWalkupScanListener,
      );
    });
  });
});
