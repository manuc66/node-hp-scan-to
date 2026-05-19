import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import { waitForScanEvent, waitScanRequest } from "../src/listening.js";
import HPApi from "../src/HPApi.js";
import type WalkupScanToCompEvent from "../src/hpModels/WalkupScanToCompEvent.js";
import { EventType } from "../src/hpModels/WalkupScanToCompEvent.js";
import type { EtagEventTable } from "../src/hpModels/EventTable.js";
import type { IEvent } from "../src/hpModels/Event.js";

describe("waitForScanEvent (includes(...) !== undefined bug guard)", () => {
  const originalGetEvents = HPApi.getEvents;

  afterEach(() => {
    HPApi.getEvents = originalGetEvents;
  });

  it("must not accept a scan event whose destinationURI does NOT include the target resourceURI (regression for 'includes(...) !== undefined')", async () => {
    const targetUri = "/WalkupScan/WalkupScanDestinations/ScanTarget1";
    const scanTargets = [
      {
        label: "TestTarget",
        resourceURI: targetUri,
        destination: "scan",
        isDuplexSingleSide: false,
      },
    ];

    // Non-matching event (should NOT be accepted)
    const nonMatchingEvent: IEvent = {
      isScanEvent: true,
      destinationURI: "/WalkupScan/WalkupScanDestinations/AnotherTarget",
      unqualifiedEventCategory: "ScanEvent",
      agingStamp: "199-9",
      compEventURI:
        "/WalkupScanToComp/WalkupScanToCompDestinations/aa8578e2-b94f-1f08-bcba-705a0fe5b7aa",
    };

    // Matching event (should be accepted)
    const matchingEvent: IEvent = {
      isScanEvent: true,
      destinationURI: `/prefix${targetUri}`, // includes targetUri
      unqualifiedEventCategory: "ScanEvent",
      agingStamp: "199-10",
      compEventURI:
        "/WalkupScanToComp/WalkupScanToCompDestinations/1c8578e2-b94f-1f08-bcba-705a0fe5b7ce",
    };

    // Prepare responses for successive HPApi.getEvents calls:
    // 1) initial call (afterEtag) -> empty events
    // 2) first poll in loop -> returns nonMatchingEvent
    // 3) second poll in loop -> returns matchingEvent
    const responses: EtagEventTable[] = [
      { etag: "etag-0", eventTable: { events: [] } },
      { etag: "etag-1", eventTable: { events: [nonMatchingEvent] } },
      { etag: "etag-2", eventTable: { events: [matchingEvent] } },
    ];

    // Mock getEvents to return prepared responses in order.
    let callIndex = 0;
    HPApi.getEvents = async (_, __) => {
      // return next prepared response; once exhausted, keep returning the last one
      const resp = responses[Math.min(callIndex, responses.length - 1)];
      callIndex++;
      return resp;
    };

    // Run the function. If the buggy predicate exists (includes(...) !== undefined),
    // the function will accept nonMatchingEvent (because false !== undefined is true)
    // and return it, causing the assertions below to fail.
    const result = await waitForScanEvent(scanTargets, null);

    // Basic sanity
    expect(result).to.not.be.null;
    expect(result!.event).to.be.an("object");

    // This is the important assertion: ensure the returned event's destinationURI actually includes the target URI.
    // If the buggy predicate is present, result.event will be nonMatchingEvent and this will fail.
    expect(result!.event.destinationURI).to.include(
      targetUri,
      "Bug detected: function returned an event whose destinationURI does not include the expected resourceURI (likely due to using includes(...) !== undefined).",
    );
  });
});

describe("waitScanRequest", () => {
  const originalGetWalkupScanToCompEvent = HPApi.getWalkupScanToCompEvent;
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    globalThis.setTimeout = ((
      cb: (...args: any[]) => void,
      _ms?: number,
      ...args: any[]
    ) => {
      cb(...args);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
  });

  afterEach(() => {
    HPApi.getWalkupScanToCompEvent = originalGetWalkupScanToCompEvent;
    globalThis.setTimeout = originalSetTimeout;
  });

  it("should wait until ScanRequested event is received", async () => {
    let callCount = 0;
    HPApi.getWalkupScanToCompEvent = async () => {
      callCount++;
      if (callCount < 3) {
        return { eventType: EventType.HostSelected } as any;
      }
      return { eventType: EventType.ScanRequested } as any;
    };

    const result = await waitScanRequest("uri", 5);
    expect(result).to.be.true;
    expect(callCount).to.be.eq(3);
  });

  it("should return false after userActionTimeout attempts", async () => {
    let callCount = 0;
    HPApi.getWalkupScanToCompEvent = async () => {
      callCount++;
      return { eventType: EventType.HostSelected } as any;
    };

    const result = await waitScanRequest("uri", 3);
    expect(result).to.be.false;
    expect(callCount).to.be.eq(3);
  });
});
