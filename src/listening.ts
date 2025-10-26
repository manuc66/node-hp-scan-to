import HPApi from "./HPApi.js";
import type Event from "./hpModels/Event.js";
import Destination from "./hpModels/Destination.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import type {
  RegistrationConfig,
  ScanTarget,
  SelectedScanTarget,
} from "./type/scanTargetDefinitions.js";
import { EventType } from "./hpModels/WalkupScanToCompEvent.js";

export async function waitScanRequest(compEventURI: string): Promise<boolean> {
  const waitMax = 50;
  for (let i = 0; i < waitMax; i++) {
    const walkupScanToCompEvent =
      await HPApi.getWalkupScanToCompEvent(compEventURI);
    const eventType = walkupScanToCompEvent.eventType;
    if (eventType === EventType.HostSelected) {
      // this ok to wait
    } else if (eventType === EventType.ScanRequested) {
      break;
    } else if (eventType === EventType.ScanNewPageRequested) {
      break;
    } else {
      console.log("no more page to scan, scan is finished");
      return false;
    }

    console.log(`Waiting for user input (attempt ${i + 1} of ${waitMax})`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s
  }
  return true;
}

export async function waitForScanEventFromTarget(
  scanTarget: ScanTarget,
  afterEtag: string,
): Promise<Event | undefined> {
  console.log("Waiting for additional pages or scan completion...");
  return (await waitForScanEventInternal([scanTarget], afterEtag))?.event;
}

export async function waitForScanEvent(
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
): Promise<SelectedScanTarget | null> {
  const targetList = scanTargets
    .map((x) => `${x.label} (${x.resourceURI.split("/").pop()})`)
    .join(", ");
  const since = afterEtag !== null ? ` since event ${afterEtag}` : "";
  console.log(`Waiting for scan event from: ${targetList}${since}`);

  return await waitForScanEventInternal(scanTargets, afterEtag);
}

async function waitForScanEventInternal(
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
): Promise<SelectedScanTarget | null> {
  let eventTable = await HPApi.getEvents(afterEtag ?? "");
  let acceptedScanEvent: Event | undefined = undefined;
  let scanTarget: ScanTarget | undefined = undefined;
  let currentEtag = eventTable.etag;
  while (acceptedScanEvent === undefined) {
    eventTable = await HPApi.getEvents(currentEtag, 1200);
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
          ev.destinationURI?.includes(scanTargets[i].resourceURI) !== undefined,
      );
    }
  }
  if (scanTarget === undefined) {
    return null;
  }
  return { event: acceptedScanEvent, ...scanTarget };
}

async function registerWalkupScanDestination(
  registrationConfigs: RegistrationConfig[],
  isScanToComp = false,
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

  console.log(
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
      console.log(`New Destination registered: ${hostname} - ${resourceURI}`);
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
): Promise<SelectedScanTarget | null> {
  const scanTargets = await registerWalkupScanDestination(
    registrationConfigs,
    deviceCapabilities.useWalkupScanToComp,
  );

  return await waitForScanEvent(scanTargets);
}
