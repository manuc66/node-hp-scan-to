import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { waitForScanEvent, waitScanRequest } from "../src/listening.js";
import DeviceClient from "../src/DeviceClient.js";
import { EventType } from "../src/hpModels/WalkupScanToCompEvent.js";
import type WalkupScanToCompEvent from "../src/hpModels/WalkupScanToCompEvent.js";
import type { EtagEventTable } from "../src/hpModels/EventTable.js";
import type { IEvent } from "../src/hpModels/Event.js";

describe("waitForScanEvent (includes(...) !== undefined bug guard)", () => {
  it("must not accept a scan event whose destinationURI does NOT include the target resourceURI (regression for 'includes(...) !== undefined')", async () => {
    const api = new DeviceClient("127.0.0.1", false);
    const targetUri = "/WalkupScan/WalkupScanDestinations/ScanTarget1";
    const scanTargets = [
      {
        label: "TestTarget",
        resourceURI: targetUri,
        destination: "scan",
        isDuplexSingleSide: false,
      },
    ];

    const nonMatchingEvent: IEvent = {
      isScanEvent: true,
      destinationURI: "/WalkupScan/WalkupScanDestinations/AnotherTarget",
      unqualifiedEventCategory: "ScanEvent",
      agingStamp: "199-9",
      compEventURI:
        "/WalkupScanToComp/WalkupScanToCompDestinations/aa8578e2-b94f-1f08-bcba-705a0fe5b7aa",
    };

    const matchingEvent: IEvent = {
      isScanEvent: true,
      destinationURI: `/prefix${targetUri}`,
      unqualifiedEventCategory: "ScanEvent",
      agingStamp: "199-10",
      compEventURI:
        "/WalkupScanToComp/WalkupScanToCompDestinations/1c8578e2-b94f-1f08-bcba-705a0fe5b7ce",
    };

    const responses: EtagEventTable[] = [
      { etag: "etag-0", eventTable: { events: [] } },
      { etag: "etag-1", eventTable: { events: [nonMatchingEvent] } },
      { etag: "etag-2", eventTable: { events: [matchingEvent] } },
    ];

    let callIndex = 0;
    api.getEvents = async (_, __) => {
      const resp = responses[Math.min(callIndex, responses.length - 1)];
      callIndex++;
      return resp;
    };

    const result = await waitForScanEvent(api, scanTargets, null);

    expect(result).to.not.be.null;
    expect(result!.event).to.be.an("object");
    expect(result!.event.destinationURI).to.include(
      targetUri,
      "Bug detected: function returned an event whose destinationURI does not include the expected resourceURI (likely due to using includes(...) !== undefined).",
    );
  });
});

describe("waitScanRequest", () => {
  let api: DeviceClient;
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    api = new DeviceClient("127.0.0.1", false);
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

  it("should wait until ScanRequested event is received", async () => {
    let callCount = 0;
    const mockEvent = (
      eventType: EventType,
    ): Partial<WalkupScanToCompEvent> => ({ eventType });
    api.getWalkupScanToCompEvent = async () => {
      callCount++;
      if (callCount < 3) {
        return mockEvent(EventType.HostSelected) as WalkupScanToCompEvent;
      }
      return mockEvent(EventType.ScanRequested) as WalkupScanToCompEvent;
    };

    const result = await waitScanRequest(api, "uri", 5);
    expect(result).to.be.true;
    expect(callCount).to.be.eq(3);
  });

  it("should return false after userActionTimeout attempts", async () => {
    let callCount = 0;
    api.getWalkupScanToCompEvent = async () => {
      callCount++;
      return { eventType: EventType.HostSelected } as WalkupScanToCompEvent;
    };

    const result = await waitScanRequest(api, "uri", 3);
    expect(result).to.be.false;
    expect(callCount).to.be.eq(3);
  });
});
