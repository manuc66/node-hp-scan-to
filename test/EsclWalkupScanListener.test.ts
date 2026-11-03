import { describe, it } from "mocha";
import { expect } from "chai";
import os from "node:os";
import { AxiosError, type AxiosResponse } from "axios";
import type DeviceClient from "../src/DeviceClient.js";
import EsclWalkupEvent from "../src/hpModels/EsclWalkupEvent.js";
import { KnownShortcut } from "../src/type/KnownShortcut.js";
import { ScanPlexMode } from "../src/hpModels/ScanPlexMode.js";
import EsclWalkupScanListener, {
  mapShortcut,
} from "../src/scanListeners/EsclWalkupScanListener.js";

function event(xml: string): Promise<EsclWalkupEvent> {
  return EsclWalkupEvent.create(xml);
}

function scanRequested(
  shortcut = "Paperless",
  duplex = "false",
): Promise<EsclWalkupEvent> {
  return event(`<?xml version="1.0"?>
<scan:WalkupScanEvent xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
    xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Event>ScanRequested</scan:Event>
  <scan:Shortcut>${shortcut}</scan:Shortcut>
  <scan:ScanSettings><scan:Duplex>${duplex}</scan:Duplex></scan:ScanSettings>
</scan:WalkupScanEvent>`);
}

function simpleEvent(type: string): Promise<EsclWalkupEvent> {
  return event(`<?xml version="1.0"?>
<scan:WalkupScanEvent xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03">
  <scan:Event>${type}</scan:Event>
</scan:WalkupScanEvent>`);
}

function notFoundError(): AxiosError {
  return new AxiosError("Not Found", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 404,
  } as AxiosResponse);
}

class FakeApi {
  readonly registrations: { host: string; shortcuts: string[] }[] = [];
  readonly events: (EsclWalkupEvent | Error | null)[] = [];
  readonly removed: string[] = [];

  async registerEsclWalkupSubscription(
    host: string,
    shortcuts: string[],
  ): Promise<string> {
    this.registrations.push({ host, shortcuts });
    return `/eSCL/WalkupSubscriptions/sub-${this.registrations.length}`;
  }

  async getEsclWalkupEvent(): Promise<EsclWalkupEvent | null> {
    const next = this.events.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next ?? null;
  }

  async removeEsclWalkupSubscription(uri: string): Promise<void> {
    this.removed.push(uri);
  }
}

const configs = [
  { label: "Paperless", isDuplexSingleSide: false },
  { label: "Paperless duplex", isDuplexSingleSide: true },
];

describe("EsclWalkupScanListener", () => {
  it("registers one subscription with the configured shortcuts", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );
    api.events.push(await scanRequested());

    await listener.waitForScan();

    expect(api.registrations).to.have.lengthOf(1);
    expect(api.registrations[0].host).to.equal(os.hostname());
    expect(api.registrations[0].shortcuts).to.deep.equal([
      "Paperless",
      "Paperless duplex",
    ]);
  });

  it("skips HostSelected and returns the requested shortcut", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );
    api.events.push(await simpleEvent("HostSelected"));
    api.events.push(await scanRequested("Paperless duplex", "true"));

    const request = await listener.waitForScan();

    expect(request?.label).to.equal("Paperless duplex");
    expect(request?.shortcut).to.equal(KnownShortcut.SavePDF);
    expect(request?.scanPlexMode).to.equal(ScanPlexMode.Duplex);
    expect(request?.resourceURI).to.equal("escl-walkup:Paperless duplex");
  });

  it("falls back to the first target for an unknown shortcut", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );
    api.events.push(await scanRequested("Panel shortcut"));

    const request = await listener.waitForScan();

    expect(request?.label).to.equal("Paperless");
  });

  it("re-registers when the subscription expired", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );
    api.events.push(notFoundError());
    api.events.push(await scanRequested());

    const request = await listener.waitForScan();

    expect(api.registrations).to.have.lengthOf(2);
    expect(request).to.not.be.null;
  });

  it("limits the registration to the device shortcut limit", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      Array.from({ length: 6 }, (_, i) => ({
        label: `shortcut-${i}`,
        isDuplexSingleSide: false,
      })),
    );
    api.events.push(await scanRequested("shortcut-0"));

    await listener.waitForScan();

    expect(api.registrations[0].shortcuts).to.have.lengthOf(5);
  });

  it("treats ScanPagesComplete and HostSelected as end of session", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );
    api.events.push(await simpleEvent("ScanPagesComplete"));

    expect(await listener.waitForNextPage()).to.be.null;

    api.events.push(await simpleEvent("HostSelected"));
    expect(await listener.waitForNextPage()).to.be.null;
  });

  it("returns a new request when the user adds a page", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );
    api.events.push(await scanRequested("Paperless"));

    const request = await listener.waitForNextPage();

    expect(request?.label).to.equal("Paperless");
  });

  it("removes the subscription on dispose, once", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );
    api.events.push(await scanRequested());
    await listener.waitForScan();

    await listener.dispose();
    await listener.dispose();

    expect(api.removed).to.deep.equal(["/eSCL/WalkupSubscriptions/sub-1"]);
  });

  it("does nothing on dispose when no subscription was registered", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );

    await listener.dispose();

    expect(api.removed).to.be.empty;
  });

  it("ScanRequested is already the start signal", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api as unknown as DeviceClient,
      configs,
    );
    api.events.push(await scanRequested());

    const request = await listener.waitForScan();
    expect(request).to.not.be.null;
    expect(await listener.waitForScanStart()).to.be.true;
  });
});

describe("mapShortcut", () => {
  it("keeps legacy enum values", () => {
    expect(mapShortcut("SaveJPEG")).to.equal(KnownShortcut.SaveJPEG);
    expect(mapShortcut("SavePDF")).to.equal(KnownShortcut.SavePDF);
  });

  it("detects JPEG-like labels", () => {
    expect(mapShortcut("Photo")).to.equal(KnownShortcut.SaveJPEG);
    expect(mapShortcut("scan as jpg")).to.equal(KnownShortcut.SaveJPEG);
  });

  it("defaults arbitrary labels to PDF", () => {
    expect(mapShortcut("Paperless")).to.equal(KnownShortcut.SavePDF);
  });
});
