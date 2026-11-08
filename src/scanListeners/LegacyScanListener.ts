import type DeviceClient from "../DeviceClient.js";
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

/**
 * Adapter for the HP-proprietary WalkupScan and WalkupScanToComp protocols.
 * Behaviour is identical to the historical implementation; it is only hidden
 * behind the ScanListener interface so `listen` can also speak eSCL.
 */
export default class LegacyScanListener implements ScanListener {
  constructor(
    private readonly api: DeviceClient,
    private readonly registrationConfigs: RegistrationConfig[],
    private readonly isScanToComp: boolean,
    private readonly userActionTimeout: number | null,
  ) {}

  async waitForScan(): Promise<ScanRequest | null> {
    // Re-discover the destinations on every iteration (cheap HTTP calls).
    // The device may have rebooted and lost the registrations since the
    // previous scan, exactly like the historical implementation.
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
          continuation: selected.event,
        };
      }
    }

    return request;
  }

  async waitForScanStart(request: ScanRequest): Promise<boolean> {
    const event = request.continuation as IEvent;
    if (event.compEventURI === undefined) {
      return true;
    }
    return await waitScanRequest(
      this.api,
      event.compEventURI,
      this.userActionTimeout,
    );
  }

  async waitForNextPage(request: ScanRequest): Promise<ScanRequest | null> {
    const event = request.continuation as IEvent;
    if (
      event.destinationURI === undefined ||
      event.compEventURI === undefined
    ) {
      return null;
    }

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
      return null;
    }

    const startNewScanJob = await waitScanNewPageRequest(
      this.api,
      nextEvent.compEventURI,
      this.userActionTimeout,
    );
    if (!startNewScanJob) {
      return null;
    }

    return { ...request, continuation: nextEvent };
  }
}
