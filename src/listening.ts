import HPApi from "./HPApi";
import Event from "./hpModels/Event";
import Destination from "./hpModels/Destination";
import { DeviceCapabilities } from "./type/DeviceCapabilities";
import {
  RegistrationConfig,
  ScanTarget,
  SelectedScanTarget,
} from "./type/scanTargetDefinitions";
import { EventType } from "./hpModels/WalkupScanToCompEvent";
import { getLoggerForFile } from "./logger";

const logger = getLoggerForFile(__filename);

export async function waitScanRequest(compEventURI: string): Promise<boolean> {
  const waitMax = 50;
  for (let i = 0; i < waitMax; i++) {
    const walkupScanToCompEvent =
      await HPApi.getWalkupScanToCompEvent(compEventURI);
    const eventType = walkupScanToCompEvent.eventType;
    const eventTypeStr = eventType.toString();
    if (eventType === EventType.HostSelected) {
      // this ok to wait
    } else if (eventType === EventType.ScanRequested) {
      break;
    } else if (eventType === EventType.ScanNewPageRequested) {
      break;
    } else if (eventType === EventType.ScanPagesComplete) {
      logger.info("no more page to scan, scan is finished");
      return false;
    } else {
      logger.warn(`Unknown eventType: ${eventTypeStr}`);
      return false;
    }

    logger.info(`Waiting for user input (attempt ${i + 1} of ${waitMax})`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s
  }
  return true;
}

export async function waitForScanEventFromTarget(
  scanTarget: ScanTarget,
  afterEtag: string,
): Promise<Event> {
  logger.info("Waiting for additional pages or scan completion...");
  return (await waitForScanEventInternal([scanTarget], afterEtag)).event;
}

export async function waitForScanEvent(
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
): Promise<SelectedScanTarget> {
  const targetList = scanTargets
    .map((x) => `${x.label} (${x.resourceURI.split("/").pop()})`)
    .join(", ");
  const since = afterEtag ? ` since event ${afterEtag}` : "";
  logger.info(`Waiting for scan event from: ${targetList}${since}`);

  return await waitForScanEventInternal(scanTargets, afterEtag);
}

async function waitForScanEventInternal(
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
): Promise<SelectedScanTarget> {
  let eventTable = await HPApi.getEvents(afterEtag ?? "");
  let acceptedScanEvent: Event | undefined = undefined;
  let scanTarget: ScanTarget;
  let currentEtag = eventTable.etag;
  while (acceptedScanEvent == null) {
    eventTable = await HPApi.getEvents(currentEtag, 1200);
    currentEtag = eventTable.etag;

    for (let i = 0; i < scanTargets.length && acceptedScanEvent == null; i++) {
      scanTarget = scanTargets[i];
      acceptedScanEvent = eventTable.eventTable.events.find(
        (ev) =>
          ev.isScanEvent &&
          ev.destinationURI &&
          ev.destinationURI.indexOf(scanTarget.resourceURI) >= 0,
      );
    }
  }
  return { event: acceptedScanEvent, ...scanTarget! };
}

async function registerWalkupScanDestination(
  registrationConfigs: RegistrationConfig[],
  isScanToComp: boolean,
): Promise<ScanTarget[]> {
  const registerMethod = isScanToComp
    ? (destination: Destination) =>
        HPApi.registerWalkupScanToCompDestination(destination)
    : (destination: Destination) =>
        HPApi.registerWalkupScanDestination(destination);

  const walkupScanDestinations = isScanToComp
    ? await HPApi.getWalkupScanToCompDestinations()
    : await HPApi.getWalkupScanDestinations();

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

export async function waitScanEvent(
  deviceCapabilities: DeviceCapabilities,
  registrationConfigs: RegistrationConfig[],
): Promise<SelectedScanTarget> {
  let useWalkupScanToComp: boolean;
  if (deviceCapabilities.useWalkupScanToComp != undefined) {
    useWalkupScanToComp = deviceCapabilities.useWalkupScanToComp;
  } else {
    logger.warn(
      "No compatible device capabilities detected. It appears that your device may not support the listen command. While the application will still run, there is a possibility it may crash. If your device includes an automatic document feeder, consider using the adf-autoscan command instead.",
    );
    useWalkupScanToComp = false;
  }

  const scanTargets = await registerWalkupScanDestination(
    registrationConfigs,
    useWalkupScanToComp,
  );

  return await waitForScanEvent(scanTargets);
}
