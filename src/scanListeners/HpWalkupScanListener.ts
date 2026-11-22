import type { HpWalkupDevice } from "../type/WalkupDevice.js";
import type { IEvent } from "../hpModels/Event.js";
import type {
  RegistrationConfig,
  ScanTarget,
} from "../type/scanTargetDefinitions.js";
import {
  registerWalkupScanDestination,
  waitForScanEvent,
  waitForScanEventFromTarget,
  waitScanNewPageRequest,
  waitScanRequest,
} from "../listening.js";
import { tryGetDestination } from "../scanProcessing.js";
import type { ScanListener, ScanRequest } from "./ScanListener.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

/**
 * Adapter for the HP-proprietary WalkupScan and WalkupScanToComp protocols.
 * Behaviour is identical to the previous implementation; it is only hidden
 * behind the ScanListener interface so `listen` can also speak eSCL.
 */
export default class HpWalkupScanListener implements ScanListener {
  /** Target and event of the session being scanned; owned by this listener. */
  private currentRequest: ScanRequest | null = null;
  private currentEvent: IEvent | null = null;

  constructor(
    private readonly api: HpWalkupDevice,
    private readonly registrationConfigs: RegistrationConfig[],
    private readonly isScanToComp: boolean,
    private readonly userActionTimeout: number | null,
  ) {}

  async waitForScan(): Promise<ScanRequest | null> {
    // Re-discover the destinations on every iteration (cheap HTTP calls).
    // The device may have rebooted and lost the registrations since the
    // previous scan, exactly like the previous implementation.
    const scanTargets: ScanTarget[] = await registerWalkupScanDestination(
      this.api,
      this.registrationConfigs,
      this.isScanToComp,
    );

    let request: ScanRequest | null = null;
    while (request === null) {
      const selected = await waitForScanEvent(this.api, scanTargets);
      if (selected === null) {
        return null;
      }

      // Match the previous order: wait for the user to start the scan on
      // the comp-event channel *before* reading the destination. Some devices
      // only publish the shortcut once the host has acknowledged that start.
      if (selected.event.compEventURI !== undefined) {
        const proceedToScan = await waitScanRequest(
          this.api,
          selected.event.compEventURI,
          this.userActionTimeout,
        );
        if (!proceedToScan) {
          return null;
        }
      }

      const destination = await tryGetDestination(this.api, selected.event);
      if (destination !== null) {
        request = {
          resourceURI: selected.resourceURI,
          label: selected.label,
          isDuplexSingleSide: selected.isDuplexSingleSide,
          ...(selected.duplexAssemblyMode !== undefined && {
            duplexAssemblyMode: selected.duplexAssemblyMode,
          }),
          shortcut: destination.shortcut,
          scanPlexMode: destination.scanPlexMode,
        };
        this.currentRequest = request;
        this.currentEvent = selected.event;
      }
    }

    return request;
  }

  waitForScanStart(): Promise<boolean> {
    // `waitForScan` already waited for the comp-event start signal.
    return Promise.resolve(true);
  }

  async waitForNextPage(): Promise<ScanRequest | null> {
    const request = this.currentRequest;
    const event = this.currentEvent;
    if (request === null || event?.compEventURI === undefined) {
      return null;
    }

    // Timestamp of the end of the page just scanned: waitScanNewPageRequest
    // reports the session end relative to it, not to its own short poll.
    const pageCompletedAt = Date.now();
    const nextEvent = await waitForScanEventFromTarget(
      this.api,
      {
        resourceURI: request.resourceURI,
        label: request.label,
        isDuplexSingleSide: request.isDuplexSingleSide,
      },
      event.agingStamp,
      this.userActionTimeout,
    );
    if (nextEvent?.compEventURI === undefined) {
      if (nextEvent !== undefined) {
        const elapsed = ((Date.now() - pageCompletedAt) / 1000).toFixed(1);
        logger.info(
          `Printer closed the flatbed session (next scan event without WalkupScanToComp event) ${elapsed}s after the page; finalizing the scan`,
        );
      }
      return null;
    }

    const startNewScanJob = await waitScanNewPageRequest(
      this.api,
      nextEvent.compEventURI,
      this.userActionTimeout,
      pageCompletedAt,
    );
    if (!startNewScanJob) {
      return null;
    }

    this.currentEvent = nextEvent;
    return request;
  }
}
