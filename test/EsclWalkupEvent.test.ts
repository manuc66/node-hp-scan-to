import { describe, it } from "mocha";
import { expect } from "chai";
import EsclWalkupEvent, {
  EsclWalkupEventType,
} from "../src/hpModels/EsclWalkupEvent.js";
import { ScanPlexMode } from "../src/hpModels/ScanPlexMode.js";

const scanRequested = (
  duplex = "false",
  shortcut = "Paperless",
) => `<?xml version="1.0"?>
<scan:WalkupScanEvent
    xmlns:dest="http://schemas.hp.com/imaging/httpdestination/2011/10/13"
    xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm"
    xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <scan:ResourceURI>/eSCL/WalkupSubscriptions/sub-1</scan:ResourceURI>
  <scan:HostIdentifier>homelab</scan:HostIdentifier>
  <scan:Connection>Network</scan:Connection>
  <scan:Event>ScanRequested</scan:Event>
  <scan:Shortcut>${shortcut}</scan:Shortcut>
  <scan:ScanSettings>
    <pwg:Version>2.4</pwg:Version>
    <scan:XResolution>300</scan:XResolution>
    <scan:YResolution>300</scan:YResolution>
    <scan:Duplex>${duplex}</scan:Duplex>
  </scan:ScanSettings>
</scan:WalkupScanEvent>`;

describe("EsclWalkupEvent", () => {
  it("parses a ScanRequested event", async () => {
    const event = await EsclWalkupEvent.create(scanRequested());

    expect(event.eventType).to.equal(EsclWalkupEventType.ScanRequested);
    expect(event.resourceURI).to.equal("/eSCL/WalkupSubscriptions/sub-1");
    expect(event.hostIdentifier).to.equal("homelab");
    expect(event.shortcut).to.equal("Paperless");
    expect(event.scanPlexMode).to.equal(ScanPlexMode.Simplex);
  });

  it("maps a duplex setting", async () => {
    const event = await EsclWalkupEvent.create(scanRequested("true"));

    expect(event.scanPlexMode).to.equal(ScanPlexMode.Duplex);
  });

  it("returns null when optional fields are missing", async () => {
    const event = await EsclWalkupEvent.create(`<?xml version="1.0"?>
<scan:WalkupScanEvent xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03">
  <scan:Event>ScanPagesComplete</scan:Event>
</scan:WalkupScanEvent>`);

    expect(event.eventType).to.equal(EsclWalkupEventType.ScanPagesComplete);
    expect(event.resourceURI).to.be.null;
    expect(event.hostIdentifier).to.be.null;
    expect(event.shortcut).to.be.null;
    expect(event.scanPlexMode).to.be.null;
  });
});
