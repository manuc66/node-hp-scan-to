import { describe, it } from "mocha";
import { expect } from "chai";
import os from "node:os";
import { AxiosError, type AxiosResponse } from "axios";
import EsclWalkupEvent from "../src/hpModels/EsclWalkupEvent.js";
import { KnownShortcut } from "../src/type/KnownShortcut.js";
import { ScanPlexMode } from "../src/hpModels/ScanPlexMode.js";
import EsclWalkupScanListener, {
  mapShortcut,
} from "../src/scanListeners/EsclWalkupScanListener.js";
import {
  PermanentScanListenerError,
  type ScanRequest,
} from "../src/scanListeners/ScanListener.js";
import {
  EsclWalkupProbe,
  type EsclWalkupProbeResult,
} from "../src/type/EsclWalkupProbe.js";

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

function httpError(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    { status } as AxiosResponse,
  );
}

function notFoundError(): AxiosError {
  return httpError(404);
}

class FakeApi {
  readonly registrations: { host: string; shortcuts: string[] }[] = [];
  readonly events: (EsclWalkupEvent | Error | null)[] = [];
  readonly removed: string[] = [];
  alwaysExpired = false;
  expiredError: AxiosError = notFoundError();
  alwaysUnavailable = false;
  getEventCalls = 0;
  probeResult: EsclWalkupProbeResult = EsclWalkupProbe.Supported;
  probeCalls = 0;
  removeError: Error | null = null;

  async registerEsclWalkupSubscription(
    host: string,
    shortcuts: string[],
  ): Promise<string> {
    this.registrations.push({ host, shortcuts });
    return `/eSCL/WalkupSubscriptions/sub-${this.registrations.length}`;
  }

  async getEsclWalkupEvent(): Promise<EsclWalkupEvent | null> {
    this.getEventCalls++;
    if (this.alwaysUnavailable) {
      throw httpError(503);
    }
    if (this.alwaysExpired) {
      throw this.expiredError;
    }
    const next = this.events.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next ?? null;
  }

  async probeEsclWalkup(): Promise<
    "supported" | "missing" | "refused" | "unreachable"
  > {
    this.probeCalls++;
    return this.probeResult;
  }

  async removeEsclWalkupSubscription(uri: string): Promise<void> {
    if (this.removeError !== null) {
      throw this.removeError;
    }
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
    const listener = new EsclWalkupScanListener(api, configs);
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
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(await simpleEvent("HostSelected"));
    api.events.push(await scanRequested("Paperless duplex", "true"));

    const request = await listener.waitForScan();

    expect(request?.label).to.equal("Paperless duplex");
    expect(request?.shortcut).to.equal(KnownShortcut.SavePDF);
    expect(request?.scanPlexMode).to.equal(ScanPlexMode.Duplex);
    expect(request?.resourceURI).to.equal("escl-walkup:Paperless duplex");
    expect(request?.contextID).to.equal("sub-1");
  });

  it("falls back to the first target for an unknown shortcut", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(await scanRequested("Panel shortcut"));

    const request = await listener.waitForScan();

    expect(request?.label).to.equal("Paperless");
  });

  it("re-registers when the subscription expired", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(notFoundError());
    api.events.push(await scanRequested());

    const request = await listener.waitForScan();

    expect(api.registrations).to.have.lengthOf(2);
    expect(request).to.not.be.null;
  });

  it("gives up when a fresh subscription keeps expiring", async () => {
    const api = new FakeApi();
    api.alwaysExpired = true;
    const listener = new EsclWalkupScanListener(api, configs);

    let error: unknown;
    try {
      await listener.waitForScan();
    } catch (e) {
      error = e;
    }

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.match(/keeps expiring|giving up/);
    expect(api.registrations).to.have.lengthOf(2);
  });

  it("re-registers and deletes the stale subscription after a 403", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(httpError(403));
    api.events.push(await scanRequested());

    const request = await listener.waitForScan();

    expect(api.probeCalls).to.equal(1);
    expect(api.registrations).to.have.lengthOf(2);
    expect(api.removed).to.deep.equal(["/eSCL/WalkupSubscriptions/sub-1"]);
    expect(request?.contextID).to.equal("sub-2");
  });

  it("does not touch the subscription when the device is not ready", async () => {
    const api = new FakeApi();
    api.probeResult = EsclWalkupProbe.Refused;
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(httpError(403));

    const error = await rejectionOf(listener.waitForScan());

    expect(error).to.be.instanceOf(Error);
    expect(error).to.not.be.instanceOf(PermanentScanListenerError);
    expect((error as Error).message).to.match(/not ready/i);
    expect(api.registrations).to.have.lengthOf(1);
    expect(api.removed).to.be.empty;
  });

  it("fails permanently when the device stops serving the walkup route", async () => {
    const api = new FakeApi();
    api.probeResult = EsclWalkupProbe.Missing;
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(httpError(404));

    const error = await rejectionOf(listener.waitForScan());

    expect(error).to.be.instanceOf(PermanentScanListenerError);
    expect((error as Error).message).to.match(/no longer/i);
    expect(api.registrations).to.have.lengthOf(1);
  });

  it("keeps the subscription when the device cannot be reached", async () => {
    const api = new FakeApi();
    api.probeResult = EsclWalkupProbe.Unreachable;
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(httpError(404));

    const error = await rejectionOf(listener.waitForScan());

    expect((error as Error).message).to.match(/could not reach/i);
    expect(api.registrations).to.have.lengthOf(1);
    expect(api.removed).to.be.empty;
  });

  it("re-registers even when deleting the stale subscription fails", async () => {
    const api = new FakeApi();
    api.removeError = httpError(403);
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(httpError(403));
    api.events.push(await scanRequested());

    const request = await listener.waitForScan();

    expect(api.registrations).to.have.lengthOf(2);
    expect(request).to.not.be.null;
  });

  it("fails permanently when a fresh subscription is still refused", async () => {
    const api = new FakeApi();
    api.alwaysExpired = true;
    api.expiredError = httpError(403);
    const listener = new EsclWalkupScanListener(api, configs);

    const error = await rejectionOf(listener.waitForScan());

    expect(error).to.be.instanceOf(PermanentScanListenerError);
    expect((error as Error).message).to.match(/giving up/);
    expect(api.registrations).to.have.lengthOf(2);
  });

  it("keeps the subscription until the 503 threshold is reached", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(httpError(503));
    api.events.push(httpError(503));

    expect(await rejectionOf(listener.waitForScan())).to.be.instanceOf(
      AxiosError,
    );
    expect(await rejectionOf(listener.waitForScan())).to.be.instanceOf(
      AxiosError,
    );

    expect(api.getEventCalls).to.equal(2);
    expect(api.registrations).to.have.lengthOf(1);
    expect(api.removed).to.be.empty;
  });

  it("recovers the subscription after consecutive 503s", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(httpError(503));
    api.events.push(httpError(503));
    api.events.push(httpError(503));
    api.events.push(await scanRequested());

    const request = await waitForScanWithRetries(listener);

    expect(api.getEventCalls).to.equal(4);
    expect(api.probeCalls).to.equal(1);
    expect(api.registrations).to.have.lengthOf(2);
    expect(api.removed).to.deep.equal(["/eSCL/WalkupSubscriptions/sub-1"]);
    expect(request?.contextID).to.equal("sub-2");
  });

  it("resets the 503 counter after a successful poll", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(httpError(503));
    api.events.push(httpError(503));
    api.events.push(await simpleEvent("HostSelected"));
    api.events.push(httpError(503));
    api.events.push(httpError(503));
    api.events.push(await scanRequested());

    const request = await waitForScanWithRetries(listener);

    expect(request).to.not.be.null;
    expect(api.registrations).to.have.lengthOf(1);
    expect(api.removed).to.be.empty;
  });

  it("gives up after repeated recovery cycles", async () => {
    const api = new FakeApi();
    api.alwaysUnavailable = true;
    const listener = new EsclWalkupScanListener(api, configs);

    const error = await rejectionOf(waitForScanWithRetries(listener, 30));

    expect(error).to.be.instanceOf(PermanentScanListenerError);
    expect((error as Error).message).to.match(/503/);
    expect(api.registrations).to.have.lengthOf(3);
  });

  it("limits the registration to the device shortcut limit", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(
      api,
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
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(await simpleEvent("ScanPagesComplete"));

    expect(await listener.waitForNextPage()).to.be.null;

    api.events.push(await simpleEvent("HostSelected"));
    expect(await listener.waitForNextPage()).to.be.null;
  });

  it("returns a new request when the user adds a page", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(await scanRequested("Paperless"));

    const request = await listener.waitForNextPage();

    expect(request?.label).to.equal("Paperless");
  });

  it("re-registers when the subscription expires while waiting for a page", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(notFoundError());
    api.events.push(await scanRequested("Paperless"));

    const request = await listener.waitForNextPage();

    expect(request?.label).to.equal("Paperless");
    expect(api.registrations).to.have.lengthOf(2);
  });

  it("ends the next-page wait after the inactivity timeout", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs, 5);
    const startedAt = Date.now();

    expect(await listener.waitForNextPage()).to.be.null;
    expect(Date.now() - startedAt).to.be.lessThan(1000);
    expect(api.registrations).to.have.lengthOf(1);
  });

  it("removes the subscription on dispose, once", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(await scanRequested());
    await listener.waitForScan();

    await listener.dispose();
    await listener.dispose();

    expect(api.removed).to.deep.equal(["/eSCL/WalkupSubscriptions/sub-1"]);
  });

  it("does nothing on dispose when no subscription was registered", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);

    await listener.dispose();

    expect(api.removed).to.be.empty;
  });

  it("ScanRequested is already the start signal", async () => {
    const api = new FakeApi();
    const listener = new EsclWalkupScanListener(api, configs);
    api.events.push(await scanRequested());

    const request = await listener.waitForScan();
    expect(request).to.not.be.null;
    expect(await listener.waitForScanStart()).to.be.true;
  });
});

describe("mapShortcut", () => {
  it("keeps the built-in shortcut names", () => {
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

/**
 * Mimics the `listen` loop: each failed poll is retried on the next call.
 */
async function waitForScanWithRetries(
  listener: EsclWalkupScanListener,
  attempts = 20,
): Promise<ScanRequest | null> {
  let lastError: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      const request = await listener.waitForScan();
      if (request !== null) {
        return request;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("No scan request after retries");
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  expect.fail("Expected the promise to reject");
}
