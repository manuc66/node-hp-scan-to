import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import { readDeviceCapabilities } from "../src/readDeviceCapabilities.js";
import HPApi from "../src/HPApi.js";
import { InputSource } from "../src/type/InputSource.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import { createImageFormat } from "../src/imageFormats/index.js";

describe("readDeviceCapabilities", () => {
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

    const caps = await readDeviceCapabilities(false);

    expect(caps.platenMaxWidth).to.equal(2550);
    expect(caps.platenMaxHeight).to.equal(3300);
    expect(caps.isEscl).to.be.false;
    expect(caps.useWalkupScanToComp).to.be.false;
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

    const caps = await readDeviceCapabilities(true);

    expect(caps.isEscl).to.be.true;
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

    const caps = await readDeviceCapabilities(false);

    expect(caps.useWalkupScanToComp).to.be.true;
    expect(caps.supportsMultiItemScanFromPlaten).to.be.true;
  });
});
