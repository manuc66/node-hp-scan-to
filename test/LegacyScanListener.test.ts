import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import type DeviceClient from "../src/DeviceClient.js";
import type { IEvent } from "../src/hpModels/Event.js";
import type { EtagEventTable } from "../src/hpModels/EventTable.js";
import { EventType } from "../src/hpModels/WalkupScanToCompEvent.js";
import LegacyScanListener from "../src/scanListeners/LegacyScanListener.js";
import type { ScanRequest } from "../src/scanListeners/ScanListener.js";
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

function request(event: IEvent): ScanRequest {
  return {
    resourceURI: "/WalkupScan/Destinations/1",
    label: "host",
    isDuplexSingleSide: false,
    shortcut: KnownShortcut.SavePDF,
    scanPlexMode: ScanPlexMode.Simplex,
    continuation: event,
  };
}

function eventTable(event: IEvent): EtagEventTable {
  return { etag: "1", eventTable: { events: [event] } };
}

class FakeApi {
  events: EtagEventTable = eventTable(scanEvent());
  compEventType: EventType = EventType.ScanRequested;

  async getEvents(): Promise<EtagEventTable> {
    return this.events;
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

  it("returns true immediately when the event has no comp event URI", async () => {
    const listener = new LegacyScanListener(
      new FakeApi() as unknown as DeviceClient,
      [{ label: "host", isDuplexSingleSide: false }],
      false,
      null,
    );

    const started = await listener.waitForScanStart(
      request(scanEvent({ compEventURI: undefined })),
    );

    expect(started).to.be.true;
  });

  it("waits for ScanRequested on the comp event channel", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.ScanRequested;
    const listener = new LegacyScanListener(
      api as unknown as DeviceClient,
      [{ label: "host", isDuplexSingleSide: false }],
      true,
      1,
    );

    const started = await listener.waitForScanStart(request(scanEvent()));

    expect(started).to.be.true;
  });

  it("returns false when no user action arrives in time", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.HostSelected;
    const listener = new LegacyScanListener(
      api as unknown as DeviceClient,
      [{ label: "host", isDuplexSingleSide: false }],
      true,
      0,
    );

    const started = await listener.waitForScanStart(request(scanEvent()));

    expect(started).to.be.false;
  });

  it("ends the session when the event has no destination", async () => {
    const listener = new LegacyScanListener(
      new FakeApi() as unknown as DeviceClient,
      [{ label: "host", isDuplexSingleSide: false }],
      false,
      null,
    );

    const next = await listener.waitForNextPage(
      request(scanEvent({ destinationURI: undefined })),
    );

    expect(next).to.be.null;
  });

  it("ends the session when the next event has no comp event URI", async () => {
    const api = new FakeApi();
    api.events = eventTable(scanEvent({ compEventURI: undefined }));
    const listener = new LegacyScanListener(
      api as unknown as DeviceClient,
      [{ label: "host", isDuplexSingleSide: false }],
      false,
      null,
    );

    const next = await listener.waitForNextPage(request(scanEvent()));

    expect(next).to.be.null;
  });

  it("returns a new request when the user requests another page", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.ScanNewPageRequested;
    const listener = new LegacyScanListener(
      api as unknown as DeviceClient,
      [{ label: "host", isDuplexSingleSide: false }],
      false,
      1,
    );

    const next = await listener.waitForNextPage(request(scanEvent()));

    expect(next?.resourceURI).to.equal("/WalkupScan/Destinations/1");
  });

  it("ends the session when the next event completes the pages", async () => {
    const api = new FakeApi();
    api.compEventType = EventType.ScanPagesComplete;
    const listener = new LegacyScanListener(
      api as unknown as DeviceClient,
      [{ label: "host", isDuplexSingleSide: false }],
      false,
      1,
    );

    const next = await listener.waitForNextPage(request(scanEvent()));

    expect(next).to.be.null;
  });
});
