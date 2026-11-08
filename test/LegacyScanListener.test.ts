import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import type DeviceClient from "../src/DeviceClient.js";
import type { IEvent } from "../src/hpModels/Event.js";
import type { EtagEventTable } from "../src/hpModels/EventTable.js";
import { EventType } from "../src/hpModels/WalkupScanToCompEvent.js";
import LegacyScanListener from "../src/scanListeners/LegacyScanListener.js";
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

  async getWalkupScanDestinations(): Promise<{ destinations: never[] }> {
    return { destinations: [] };
  }

  async getWalkupScanToCompDestinations(): Promise<{ destinations: never[] }> {
    return { destinations: [] };
  }

  async registerWalkupScanDestination(): Promise<string> {
    return "/WalkupScan/Destinations/1";
  }

  async registerWalkupScanToCompDestination(): Promise<string> {
    return "/WalkupScan/Destinations/1";
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
    return {
      shortcut: KnownShortcut.SavePDF,
      scanPlexMode: ScanPlexMode.Simplex,
    };
  }

  async getWalkupScanToCompEvent(): Promise<{ eventType: EventType }> {
    return { eventType: this.compEventType };
  }
}

describe("LegacyScanListener", () => {
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    globalThis.setTimeout = ((
      cb: (...args: unknown[]) => void,
      _ms?: number,
      ...args: unknown[]
    ) => {
      cb(...args);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout;
  });

  function makeListener(
    api: FakeApi,
    isScanToComp = false,
    userActionTimeout: number | null = null,
  ): LegacyScanListener {
    return new LegacyScanListener(
      api as unknown as DeviceClient,
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

  it("returns false when no user action arrives in time", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.HostSelected;
    const listener = makeListener(api, true, 0);

    await listener.waitForScan();

    expect(await listener.waitForScanStart()).to.be.false;
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
    api.compEventType = EventType.ScanPagesComplete;
    const listener = makeListener(api, false, 1);

    await listener.waitForScan();
    const next = await listener.waitForNextPage();

    expect(next).to.be.null;
  });
});
