import type { LegacyWalkupDevice } from "./type/WalkupDevice.js";
import type { IEvent } from "./hpModels/Event.js";
import type { EtagEventTable } from "./hpModels/EventTable.js";
import Destination from "./hpModels/Destination.js";
import type {
  RegistrationConfig,
  ScanTarget,
  SelectedScanTarget,
} from "./type/scanTargetDefinitions.js";
import { EventType } from "./hpModels/WalkupScanToCompEvent.js";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

export async function waitScanRequest(
  api: LegacyWalkupDevice,
  compEventURI: string,
  userActionTimeout: number | null = null,
): Promise<boolean> {
  const waitMax = userActionTimeout ?? 50;
  for (let i = 0; i < waitMax; i++) {
    const walkupScanToCompEvent =
      await api.getWalkupScanToCompEvent(compEventURI);
    const eventType = walkupScanToCompEvent.eventType;
    if (eventType === EventType.HostSelected) {
      // this ok to wait
    } else if (eventType === EventType.ScanRequested) {
      return true;
    } else if (eventType === EventType.ScanNewPageRequested) {
      return true;
    } else {
      logger.info("no more page to scan, scan is finished");
      return false;
    }

    logger.info(`Waiting for user input (attempt ${i + 1} of ${waitMax})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  logger.warn("Timeout waiting for user input");
  return false;
}

export async function waitForScanEventFromTarget(
  api: LegacyWalkupDevice,
  scanTarget: ScanTarget,
  afterEtag: string,
  userActionTimeout: number | null = null,
): Promise<IEvent | undefined> {
  logger.info("Waiting for additional pages or scan completion...");
  const timeoutMs = resolveUserActionTimeoutMs(userActionTimeout);
  return (
    await waitForScanEventInternal(
      api,
      [scanTarget],
      afterEtag,
      timeoutMs,
      true,
    )
  )?.event;
}

export async function waitForScanEvent(
  api: LegacyWalkupDevice,
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
): Promise<SelectedScanTarget | null> {
  const targetList = scanTargets
    .map((x) => `${x.label} (${x.resourceURI.split("/").pop()})`)
    .join(", ");
  const since = afterEtag !== null ? ` since event ${afterEtag}` : "";
  logger.info(`Waiting for scan event from: ${targetList}${since}`);

  return await waitForScanEventInternal(
    api,
    scanTargets,
    afterEtag,
    null,
    false,
  );
}

async function waitForScanEventInternal(
  api: LegacyWalkupDevice,
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
  timeoutMs: number | null = null,
  swallowErrors = false,
): Promise<SelectedScanTarget | null> {
  let eventTable: EtagEventTable;
  try {
    eventTable = await api.getEvents(afterEtag ?? "");
  } catch (error) {
    if (!swallowErrors) {
      throw error;
    }
    logger.warn(
      { err: error },
      "Connection lost while waiting for scan event; finalizing current scan",
    );
    return null;
  }
  let acceptedScanEvent: IEvent | undefined = undefined;
  let scanTarget: ScanTarget | undefined = undefined;
  let currentEtag = eventTable.etag;
  const deadline = timeoutMs !== null ? Date.now() + timeoutMs : null;

  while (acceptedScanEvent === undefined) {
    if (deadline !== null && Date.now() >= deadline) {
      logger.warn(
        "Timed out waiting for next scan event; finalizing current scan",
      );
      return null;
    }

    const remainingMs =
      deadline !== null ? Math.max(0, deadline - Date.now()) : 120_000;
    if (deadline !== null && remainingMs <= 0) {
      logger.warn(
        "Timed out waiting for next scan event; finalizing current scan",
      );
      return null;
    }
    const deciseconds = Math.max(
      10,
      Math.min(1200, Math.floor(remainingMs / 100)),
    );

    let nextTable: EtagEventTable;
    try {
      nextTable = await api.getEvents(currentEtag, deciseconds);
    } catch (error) {
      if (!swallowErrors) {
        throw error;
      }
      logger.warn(
        { err: error },
        "Connection lost while waiting for next scan event; finalizing current scan",
      );
      return null;
    }
    eventTable = nextTable;
    currentEtag = eventTable.etag;

    for (
      let i = 0;
      i < scanTargets.length && acceptedScanEvent === undefined;
      i++
    ) {
      scanTarget = scanTargets[i];
      acceptedScanEvent = eventTable.eventTable.events.find(
        (ev) =>
          ev.isScanEvent &&
          ev.destinationURI?.includes(scanTargets[i].resourceURI) === true,
      );
    }
  }
  if (scanTarget === undefined) {
    return null;
  }
  return { event: acceptedScanEvent, ...scanTarget };
}

function resolveUserActionTimeoutMs(
  userActionTimeout: number | null,
): number | null {
  if (userActionTimeout === null || userActionTimeout === undefined) {
    return null;
  }
  const ms = userActionTimeout * 1000;
  // Clamp to a sane range to avoid waiting forever or finalizing instantly.
  const MIN_MS = 1_000;
  const MAX_MS = 300_000;
  return Math.min(MAX_MS, Math.max(MIN_MS, ms));
}

export async function registerWalkupScanDestination(
  api: LegacyWalkupDevice,
  registrationConfigs: RegistrationConfig[],
  isScanToComp = false,
): Promise<ScanTarget[]> {
  const registerMethod = isScanToComp
    ? (destination: Destination) =>
        api.registerWalkupScanToCompDestination(destination)
    : (destination: Destination) =>
        api.registerWalkupScanDestination(destination);

  const walkupScanDestinations = isScanToComp
    ? await api.getWalkupScanToCompDestinations()
    : await api.getWalkupScanDestinations();

  const destinations = walkupScanDestinations.destinations;

  logger.info(
    `Discovered available host destinations: ${destinations.map((d) => d.name).join(", ")}`,
  );

  const scanTargets: ScanTarget[] = [];

  for (const registrationConfig of registrationConfigs) {
    const hostname = registrationConfig.label;
    const destination = destinations.find((x) => x.name === hostname);

    let resourceURI: string;
    if (destination) {
      resourceURI = destination.resourceURI;
    } else {
      const newDestination = new Destination(hostname, hostname, isScanToComp);
      resourceURI = await registerMethod(newDestination);
      logger.info(`New Destination registered: ${hostname} - ${resourceURI}`);
    }

    scanTargets.push({
      resourceURI,
      ...registrationConfig,
    });
  }

  return scanTargets;
}

export async function waitScanNewPageRequest(
  api: LegacyWalkupDevice,
  compEventURI: string,
  userActionTimeout: number | null = null,
): Promise<boolean> {
  let startNewScanJob = false;
  let wait = true;
  const waitMax = userActionTimeout ?? 50;
  let i = 0;
  while (wait && i < waitMax) {
    i++;
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const walkupScanToCompEvent =
      await api.getWalkupScanToCompEvent(compEventURI);
    const eventType = walkupScanToCompEvent.eventType;
    const eventTypeStr = eventType.toString();
    if (eventType === EventType.ScanNewPageRequested) {
      startNewScanJob = true;
      wait = false;
    } else if (eventType === EventType.ScanPagesComplete) {
      wait = false;
    } else if (eventType === EventType.ScanRequested) {
      logger.info(`Waiting for user input (attempt ${i} of ${waitMax})`);
    } else {
      wait = false;
      logger.warn(`Unknown eventType: ${eventTypeStr}`);
    }
  }
  return startNewScanJob;
}
