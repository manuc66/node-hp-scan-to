import HPApi from "./HPApi";
import Event from "./Event";
import Destination from "./Destination";
import { DeviceCapabilities } from "./DeviceCapabilities";
import { RegistrationConfig, ScanTarget, SelectedScanTarget } from "./scanTargetDefinitions";

export async function waitScanRequest(compEventURI: string): Promise<boolean> {
  const waitMax = 50;
  for (let i = 0; i < waitMax; i++) {
    const walkupScanToCompEvent =
      await HPApi.getWalkupScanToCompEvent(compEventURI);
    const message = walkupScanToCompEvent.eventType;
    if (message === "HostSelected") {
      // this ok to wait
    } else if (message === "ScanRequested") {
      break;
    } else if (message === "ScanNewPageRequested") {
      break;
    } else if (message === "ScanPagesComplete") {
      console.log("no more page to scan, scan is finished");
      return false;
    } else {
      console.log(`Unknown eventType: ${message}`);
      return false;
    }

    console.log(`Waiting user input: ${i + 1}/${waitMax}`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s
  }
  return true;
}

export async function waitForScanEventFromTarget(
  scanTarget: ScanTarget,
  afterEtag: string | null = null,
): Promise<Event> {
 return (await waitForScanEvent([scanTarget], afterEtag)).event
}

export async function waitForScanEvent(
  scanTargets: ScanTarget[],
  afterEtag: string | null = null,
): Promise<SelectedScanTarget> {
  console.log("Start listening for new ScanEvent");

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
  return {event: acceptedScanEvent, ...scanTarget!};
}

async function registerWalkupScanToCompDestination(
  registrationConfig: RegistrationConfig,
): Promise<string> {
  const walkupScanDestinations = await HPApi.getWalkupScanToCompDestinations();
  const destinations = walkupScanDestinations.destinations;

  console.log(
    "Host destinations fetched:",
    destinations.map((d) => d.name).join(", "),
  );

  const hostname = registrationConfig.label;
  const destination = destinations.find((x) => x.name === hostname);

  let resourceURI;
  if (destination) {
    console.log(
      `Re-using existing destination: ${hostname} - ${destination.resourceURI}`,
    );
    resourceURI = destination.resourceURI;
  } else {
    resourceURI = await HPApi.registerWalkupScanToCompDestination(
      new Destination(hostname, hostname, true),
    );
    console.log(`New Destination registered: ${hostname} - ${resourceURI}`);
  }

  console.log(`Using: ${hostname}`);

  return resourceURI;
}

async function registerWalkupScanDestination(
  registrationConfig: RegistrationConfig,
): Promise<string> {
  const walkupScanDestinations = await HPApi.getWalkupScanDestinations();
  const destinations = walkupScanDestinations.destinations;

  console.log(
    "Host destinations fetched:",
    destinations.map((d) => d.name).join(", "),
  );

  const hostname = registrationConfig.label;
  const destination = destinations.find((x) => x.name === hostname);

  let resourceURI;
  if (destination) {
    console.log(
      `Re-using existing destination: ${hostname} - ${destination.resourceURI}`,
    );
    resourceURI = destination.resourceURI;
  } else {
    resourceURI = await HPApi.registerWalkupScanDestination(
      new Destination(hostname, hostname, false),
    );
    console.log(`New Destination registered: ${hostname} - ${resourceURI}`);
  }

  console.log(`Using: ${hostname}`);

  return resourceURI;
}

export async function waitScanEvent(
  deviceCapabilities: DeviceCapabilities,
  registrationConfigs: RegistrationConfig[],
): Promise<SelectedScanTarget> {
  const scanTargets: ScanTarget[] = [];
  for (let i = 0; i < registrationConfigs.length; i++) {
    const registrationConfig = registrationConfigs[i];
    let resourceURI: string;
    if (deviceCapabilities.useWalkupScanToComp) {
      resourceURI = await registerWalkupScanToCompDestination(registrationConfig);
    } else {
      resourceURI = await registerWalkupScanDestination(registrationConfig);
    }
    scanTargets.push({
      resourceURI: resourceURI,
      ...registrationConfig,
    });
  }

  const targetList = scanTargets.map(x => `${x.label}@${x.resourceURI}`).join(", ");
  console.log(`Waiting scan event for: ${targetList}`);
  return await waitForScanEvent(scanTargets);
}

export async function clearRegistrations() {
  const dests = await HPApi.getWalkupScanToCompDestinations();
  for (let i = 0; i < dests.destinations.length; i++) {
    console.log(`Removing: ${dests.destinations[i].name}`);
    await HPApi.removeDestination(dests.destinations[i]);
  }
}
