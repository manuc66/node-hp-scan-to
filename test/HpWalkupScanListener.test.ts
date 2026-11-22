import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import type { IEvent } from "../src/hpModels/Event.js";
import type { EtagEventTable } from "../src/hpModels/EventTable.js";
import { EventType } from "../src/hpModels/WalkupScanToCompEvent.js";
import HpWalkupScanListener from "../src/scanListeners/HpWalkupScanListener.js";
import { ScanPlexMode } from "../src/hpModels/ScanPlexMode.js";
import { KnownShortcut } from "../src/type/KnownShortcut.js";

function scanEvent(overrides: Partial<IEvent> = {}): IEvent {
  return {
    unqualifiedEventCategory: "ScanEvent",
    agingStamp: "1-1",
    destinationURI: "/WalkupScan/Destinations/1",
    compEventURI: "/WalkupScanToComp/WalkupScanToCompEvent",
    isScanEvent: true,
    ...overrides,
  };
}

function eventTable(event: IEvent, etag: string): EtagEventTable {
  return { etag, eventTable: { events: [event] } };
}

/**
 * Serves the first scan event while `waitForScan` reads the initial table,
 * then `nextEvent` for the follow-up tables read by `waitForNextPage`.
 */
class FakeApi {
  initialEvent: IEvent = scanEvent();
  nextEvent: IEvent = scanEvent();
  compEventType: EventType = EventType.ScanRequested;
  /** Type returned from the second comp-event read onwards; null = same. */
  nextCompEventType: EventType | null = null;
  readonly callOrder: string[] = [];
  readonly removedDestinations: string[] = [];
  failRemovalFor: string | null = null;
  private registrations = 0;
  private compEventReads = 0;

  async getWalkupScanDestinations(): Promise<{ destinations: never[] }> {
    return { destinations: [] };
  }

  async getWalkupScanToCompDestinations(): Promise<{ destinations: never[] }> {
    return { destinations: [] };
  }

  async registerWalkupScanDestination(): Promise<string> {
    this.registrations++;
    return `/WalkupScan/Destinations/${this.registrations}`;
  }

  async registerWalkupScanToCompDestination(): Promise<string> {
    this.registrations++;
    return `/WalkupScan/Destinations/${this.registrations}`;
  }

  async removeDestinationByUri(resourceURI: string): Promise<boolean> {
    this.removedDestinations.push(resourceURI);
    if (this.failRemovalFor === resourceURI) {
      throw new Error("remove failed");
    }
    return true;
  }

  async getEvents(afterEtag = ""): Promise<EtagEventTable> {
    return afterEtag === "" || afterEtag === "1"
      ? eventTable(this.initialEvent, "1")
      : eventTable(this.nextEvent, "2");
  }

  async getDestination(): Promise<{
    shortcut: KnownShortcut;
    scanPlexMode: ScanPlexMode;
  }> {
    this.callOrder.push("getDestination");
    return {
      shortcut: KnownShortcut.SavePDF,
      scanPlexMode: ScanPlexMode.Simplex,
    };
  }

  async getWalkupScanToCompEvent(): Promise<{ eventType: EventType }> {
    this.callOrder.push("getWalkupScanToCompEvent");
    this.compEventReads++;
    const eventType =
      this.compEventReads > 1 && this.nextCompEventType !== null
        ? this.nextCompEventType
        : this.compEventType;
    return { eventType };
  }
}

describe("HpWalkupScanListener", () => {
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    globalThis.setTimeout = ((
      cb: (...args: unknown[]) => void,
      _ms?: number,
      ...args: unknown[]
    ) => {
      cb(...args);
      return originalSetTimeout(() => undefined, 0);
    }) as typeof setTimeout;
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout;
  });

  function makeListener(
    api: FakeApi,
    isScanToComp = false,
    userActionTimeout: number | null = null,
  ): HpWalkupScanListener {
    return new HpWalkupScanListener(
      api,
      [{ label: "host", isDuplexSingleSide: false }],
      isScanToComp,
      userActionTimeout,
    );
  }

  it("returns true immediately when the event has no comp event URI", async () => {
    const api = new FakeApi();
    api.initialEvent = scanEvent({ compEventURI: undefined });
    const listener = makeListener(api);

    await listener.waitForScan();

    expect(await listener.waitForScanStart()).to.be.true;
  });

  it("waits for ScanRequested on the comp event channel", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.ScanRequested;
    const listener = makeListener(api, true, 1);

    await listener.waitForScan();

    expect(await listener.waitForScanStart()).to.be.true;
  });

  it("waits for the scan request before reading the destination shortcut", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.ScanRequested;
    const listener = makeListener(api, true, 1);

    const request = await listener.waitForScan();

    expect(request).to.not.be.null;
    expect(api.callOrder).to.deep.equal([
      "getWalkupScanToCompEvent",
      "getDestination",
    ]);
  });

  it("returns no request when no user action arrives in time", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.HostSelected;
    const listener = makeListener(api, true, 0);

    expect(await listener.waitForScan()).to.be.null;
  });

  it("returns no next page before any scan was selected", async () => {
    const listener = makeListener(new FakeApi());

    expect(await listener.waitForNextPage()).to.be.null;
  });

  it("ends the session when the next event has no comp event URI", async () => {
    const api = new FakeApi();
    api.nextEvent = scanEvent({ compEventURI: undefined });
    const listener = makeListener(api);

    await listener.waitForScan();

    expect(await listener.waitForNextPage()).to.be.null;
  });

  it("returns a new request when the user requests another page", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.ScanNewPageRequested;
    const listener = makeListener(api, false, 1);

    await listener.waitForScan();
    const next = await listener.waitForNextPage();

    expect(next?.resourceURI).to.equal("/WalkupScan/Destinations/1");
  });

  it("ends the session when the next event completes the pages", async () => {
    const api = new FakeApi();
    // The scan starts normally, then the printer closes the page session:
    // the listener must stop instead of returning a new request.
    api.compEventType = EventType.ScanRequested;
    api.nextCompEventType = EventType.ScanPagesComplete;
    const listener = makeListener(api, false, 1);

    const request = await listener.waitForScan();
    const next = await listener.waitForNextPage();

    expect(request).to.not.be.null;
    expect(next).to.be.null;
    expect(
      api.callOrder.filter((c) => c === "getWalkupScanToCompEvent"),
    ).to.have.lengthOf(2);
  });

  it("removes the registered destination on dispose so the printer stops listing the host", async () => {
    const api = new FakeApi();
    const listener = makeListener(api);

    await listener.waitForScan();
    await listener.dispose();

    expect(api.removedDestinations).to.deep.equal([
      "/WalkupScan/Destinations/1",
    ]);

    // Idempotent: a second dispose (finally + signal) removes nothing twice.
    await listener.dispose();
    expect(api.removedDestinations).to.have.lengthOf(1);
  });

  it("does nothing on dispose when no destination was registered", async () => {
    const api = new FakeApi();
    const listener = makeListener(api);

    await listener.dispose();

    expect(api.removedDestinations).to.deep.equal([]);
  });

  it("removes the other destinations when one removal fails", async () => {
    const api = new FakeApi();
    api.failRemovalFor = "/WalkupScan/Destinations/2";
    const listener = new HpWalkupScanListener(
      api,
      [
        { label: "host1", isDuplexSingleSide: false },
        { label: "host2", isDuplexSingleSide: false },
      ],
      false,
      null,
    );

    await listener.waitForScan();
    await listener.dispose();

    expect(api.removedDestinations).to.deep.equal([
      "/WalkupScan/Destinations/1",
      "/WalkupScan/Destinations/2",
    ]);
  });
});
