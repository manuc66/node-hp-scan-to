import type DeviceClient from "./DeviceClient.js";
import type { IEvent } from "./hpModels/Event.js";
import Destination from "./hpModels/Destination.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import type {
  RegistrationConfig,
  ScanTarget,
  SelectedScanTarget,
} from "./type/scanTargetDefinitions.js";
import { EventType } from "./hpModels/WalkupScanToCompEvent.js";

export async function waitScanRequest(
  api: DeviceClient,
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
      console.log("no more page to scan, scan is finished");
      return false;
    }

    console.log(`Waiting for user input (attempt ${i + 1} of ${waitMax})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log("Timeout waiting for user input");
  return false;
}

export async function waitForScanEventFromTarget(
  api: DeviceClient,
  scanTarget: ScanTarget,
  afterEtag: string,
): Promise<IEvent | undefined> {
  console.log("Waiting for additional pages or scan completion...");
  return (await waitForScanEventInternal(api, [scanTarget], afterEtag))?.event;
}

export async function waitForScanEvent(
  api: DeviceClient,
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
): Promise<SelectedScanTarget | null> {
  const targetList = scanTargets
    .map((x) => `${x.label} (${x.resourceURI.split("/").pop()})`)
    .join(", ");
  const since = afterEtag !== null ? ` since event ${afterEtag}` : "";
  console.log(`Waiting for scan event from: ${targetList}${since}`);

  return await waitForScanEventInternal(api, scanTargets, afterEtag);
}

async function waitForScanEventInternal(
  api: DeviceClient,
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
): Promise<SelectedScanTarget | null> {
  let eventTable = await api.getEvents(afterEtag ?? "");
  let acceptedScanEvent: IEvent | undefined = undefined;
  let scanTarget: ScanTarget | undefined = undefined;
  let currentEtag = eventTable.etag;
  while (acceptedScanEvent === undefined) {
    eventTable = await api.getEvents(currentEtag, 1200);
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

async function registerWalkupScanDestination(
  api: DeviceClient,
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
  api: DeviceClient,
  deviceCapabilities: DeviceCapabilities,
  registrationConfigs: RegistrationConfig[],
): Promise<SelectedScanTarget | null> {
  const scanTargets = await registerWalkupScanDestination(
    api,
    registrationConfigs,
    deviceCapabilities.useWalkupScanToComp,
  );

  return await waitForScanEvent(api, scanTargets);
}
