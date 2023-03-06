#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import os from "os";
import fs from "fs/promises";
import { Command } from "commander";
import Bonjour from "bonjour";
import config from "config";

import Destination from "./Destination";
import ScanJobSettings from "./ScanJobSettings";
import Event from "./Event";
import HPApi from "./HPApi";
import Job from "./Job";
import WalkupScanDestination from "./WalkupScanDestination";
import WalkupScanToCompDestination from "./WalkupScanToCompDestination";
import JpegUtil from "./JpegUtil";
import PathHelper from "./PathHelper";
import { createPdfFrom, ScanContent, ScanPage } from "./ScanContent";
import WalkupScanToCompCaps from "./WalkupScanToCompCaps";
import { DeviceCapabilities } from "./DeviceCapabilities";
import { delay } from "./delay";

async function waitForScanEvent(
  resourceURI: string,
  afterEtag: string | null = null
): Promise<Event> {
  console.log("Start listening for new ScanEvent");

  let eventTable = await HPApi.getEvents(afterEtag ?? "");
  let acceptedScanEvent = null;
  let currentEtag = eventTable.etag;
  while (acceptedScanEvent == null) {
    eventTable = await HPApi.getEvents(currentEtag, 1200);
    currentEtag = eventTable.etag;

    acceptedScanEvent = eventTable.eventTable.events.find(
      (ev) =>
        ev.isScanEvent &&
        ev.destinationURI &&
        ev.destinationURI.indexOf(resourceURI) >= 0
    );
  }
  return acceptedScanEvent;
}

async function waitPrinterUntilItIsReadyToUploadOrCompleted(
  jobUrl: string
): Promise<Job> {
  let job = null;
  let isReadyToUpload = false;
  do {
    job = await HPApi.getJob(jobUrl);
    if (job.jobState === "Canceled") {
      return job;
    } else if (
      job.pageState === "ReadyToUpload" ||
      job.jobState === "Completed"
    ) {
      isReadyToUpload = true;
    } else if (job.jobState == "Processing") {
      isReadyToUpload = false;
    } else {
      console.log(`Unknown jobState: ${job.jobState}`);
    }
    await delay(300);
  } while (!isReadyToUpload);
  return job;
}

async function registerWalkupScanToCompDestination(
  registrationConfig: RegistrationConfig
): Promise<string> {
  const walkupScanDestinations = await HPApi.getWalkupScanToCompDestinations();
  const destinations = walkupScanDestinations.destinations;

  console.log(
    "Host destinations fetched:",
    destinations.map((d) => d.name).join(", ")
  );

  const hostname = registrationConfig.label;
  const destination = destinations.find((x) => x.name === hostname);

  let resourceURI;
  if (destination) {
    console.log(
      `Re-using existing destination: ${hostname} - ${destination.resourceURI}`
    );
    resourceURI = destination.resourceURI;
  } else {
    resourceURI = await HPApi.registerWalkupScanToCompDestination(
      new Destination(hostname, hostname, true)
    );
    console.log(`New Destination registered: ${hostname} - ${resourceURI}`);
  }

  console.log(`Using: ${hostname}`);

  return resourceURI;
}
async function registerWalkupScanDestination(
  registrationConfig: RegistrationConfig
): Promise<string> {
  const walkupScanDestinations = await HPApi.getWalkupScanDestinations();
  const destinations = walkupScanDestinations.destinations;

  console.log(
    "Host destinations fetched:",
    destinations.map((d) => d.name).join(", ")
  );

  const hostname = registrationConfig.label;
  const destination = destinations.find((x) => x.name === hostname);

  let resourceURI;
  if (destination) {
    console.log(
      `Re-using existing destination: ${hostname} - ${destination.resourceURI}`
    );
    resourceURI = destination.resourceURI;
  } else {
    resourceURI = await HPApi.registerWalkupScanDestination(
      new Destination(hostname, hostname, false)
    );
    console.log(`New Destination registered: ${hostname} - ${resourceURI}`);
  }

  console.log(`Using: ${hostname}`);

  return resourceURI;
}

async function TryGetDestination(
  event: Event
): Promise<WalkupScanDestination | WalkupScanToCompDestination | null> {
  //this code can in some cases be executed before the user actually chooses between Document or Photo
  //so lets fetch the contentType (Document or Photo) until we get a value
  let destination: WalkupScanDestination | WalkupScanToCompDestination | null =
    null;

  for (let i = 0; i < 20; i++) {
    const destinationURI = event.destinationURI;
    if (destinationURI) {
      destination = await HPApi.getDestination(destinationURI);

      const shortcut = destination.shortcut;
      if (shortcut != null) {
        return destination;
      }
    } else {
      console.log(`No destination URI found`);
    }

    console.log(`No shortcut yet available, attempt: ${i + 1}/20`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s
  }

  console.log("Failing to detect destination shortcut");
  console.log(JSON.stringify(destination));
  return null;
}

async function fixJpegSize(filePath: string): Promise<number | null> {
  const buffer: Buffer = await fs.readFile(filePath);

  let height = JpegUtil.fixSizeWithDNL(buffer);
  if (height != null) {
    // rewrite the fixed file
    await fs.writeFile(filePath, buffer);
    return height;
  }
  return null;
}

function createScanPage(
  job: Job,
  currentPageNumber: number,
  filePath: string,
  sizeFixed: number | null
): ScanPage {
  let height = sizeFixed ?? job.imageHeight;
  return {
    path: filePath,
    pageNumber: currentPageNumber,
    width: job.imageWidth ?? 0,
    height: height ?? 0,
    xResolution: job.xResolution ?? 200,
    yResolution: job.yResolution ?? 200,
  };
}

async function handleProcessingState(
  job: Job,
  inputSource: "Adf" | "Platen",
  folder: string,
  scanCount: number,
  currentPageNumber: number,
  filePattern: string | undefined
): Promise<ScanPage | null> {
  if (
    job.pageState == "ReadyToUpload" &&
    job.binaryURL != null &&
    job.currentPageNumber != null
  ) {
    console.log(
      `Ready to download page job page ${job.currentPageNumber} at:`,
      job.binaryURL
    );

    const destinationFilePath = PathHelper.getFileForPage(
      folder,
      scanCount,
      currentPageNumber,
      filePattern,
      "jpg"
    );
    const filePath = await HPApi.downloadPage(
      job.binaryURL,
      destinationFilePath
    );
    console.log("Page downloaded to:", filePath);

    let sizeFixed: null | number = null;
    if (inputSource == "Adf") {
      sizeFixed = await fixJpegSize(filePath);
      if (sizeFixed == null) {
        console.log(
          `File size has not been fixed, DNF may not have been found and approximate height is: ${job.imageHeight}`
        );
      }
    }
    return createScanPage(job, currentPageNumber, filePath, sizeFixed);
  } else {
    console.log(`Unknown pageState: ${job.pageState}`);
    await delay(200);
    return null;
  }
}

async function waitScanRequest(compEventURI: string): Promise<boolean> {
  const waitMax = 50;
  for (let i = 0; i < waitMax; i++) {
    let walkupScanToCompEvent = await HPApi.getWalkupScanToCompEvent(
      compEventURI
    );
    let message = walkupScanToCompEvent.eventType;
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

async function executeScanJob(
  scanJobSettings: ScanJobSettings,
  inputSource: "Adf" | "Platen",
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  filePattern: string | undefined
): Promise<"Completed" | "Canceled"> {
  const jobUrl = await HPApi.postJob(scanJobSettings);

  console.log("New job created:", jobUrl);

  let job = await HPApi.getJob(jobUrl);
  while (job.jobState !== "Completed") {
    job = await waitPrinterUntilItIsReadyToUploadOrCompleted(jobUrl);

    if (job.jobState == "Completed") {
      continue;
    }

    if (job.jobState === "Processing") {
      const page = await handleProcessingState(
        job,
        inputSource,
        folder,
        scanCount,
        scanJobContent.elements.length + 1,
        filePattern
      );
      job = await HPApi.getJob(jobUrl);
      if (page != null && job.jobState != "Canceled") {
        scanJobContent.elements.push(page);
      }
    } else if (job.jobState === "Canceled") {
      console.log("Job cancelled by device");
      break;
    } else {
      console.log(`Unhandled jobState: ${job.jobState}`);
      await delay(200);
    }
  }
  console.log(
    `Job state: ${job.jobState}, totalPages: ${scanJobContent.elements.length}:`
  );
  return job.jobState;
}

async function waitScanNewPageRequest(compEventURI: string): Promise<boolean> {
  let startNewScanJob = false;
  let wait = true;
  while (wait) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s

    let walkupScanToCompEvent = await HPApi.getWalkupScanToCompEvent(
      compEventURI
    );
    let message = walkupScanToCompEvent.eventType;

    if (message === "ScanNewPageRequested") {
      startNewScanJob = true;
      wait = false;
    } else if (message === "ScanPagesComplete") {
      wait = false;
    } else if (message === "ScanRequested") {
      // continue waiting
    } else {
      wait = false;
      console.log(`Unknown eventType: ${message}`);
    }
  }
  return startNewScanJob;
}

async function executeScanJobs(
  scanJobSettings: ScanJobSettings,
  inputSource: "Adf" | "Platen",
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  firstEvent: Event,
  deviceCapabilities: DeviceCapabilities,
  filePattern: string | undefined
) {
  let jobState = await executeScanJob(
    scanJobSettings,
    inputSource,
    folder,
    scanCount,
    scanJobContent,
    filePattern
  );
  let lastEvent = firstEvent;
  if (
    jobState === "Completed" &&
    lastEvent.compEventURI &&
    inputSource !== "Adf" &&
    lastEvent.destinationURI &&
    deviceCapabilities.supportsMultiItemScanFromPlaten
  ) {
    lastEvent = await waitForScanEvent(
      lastEvent.destinationURI,
      lastEvent.agingStamp
    );
    if (!lastEvent.compEventURI) {
      return;
    }
    let startNewScanJob = await waitScanNewPageRequest(lastEvent.compEventURI);
    while (startNewScanJob) {
      jobState = await executeScanJob(
        scanJobSettings,
        inputSource,
        folder,
        scanCount,
        scanJobContent,
        filePattern
      );
      if (jobState !== "Completed") {
        return;
      }
      if (!lastEvent.destinationURI) {
        break;
      }
      lastEvent = await waitForScanEvent(
        lastEvent.destinationURI,
        lastEvent.agingStamp
      );
      if (!lastEvent.compEventURI) {
        return;
      }
      startNewScanJob = await waitScanNewPageRequest(lastEvent.compEventURI);
    }
  }
}

async function mergeToPdf(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  filePattern: string | undefined
): Promise<string | null> {
  if (scanJobContent.elements.length > 0) {
    const pdfFilePath = PathHelper.getFileForScan(
      folder,
      scanCount,
      filePattern,
      "pdf"
    );
    await createPdfFrom(scanJobContent, pdfFilePath);
    scanJobContent.elements.forEach((e) => fs.unlink(e.path));
    return pdfFilePath;
  }
  console.log(`No page available to build a pdf file`);
  return null;
}

function displayPdfScan(
  pdfFilePath: string | null,
  scanJobContent: ScanContent
) {
  if (pdfFilePath === null) {
    console.log(`Pdf generated has not been generated`);
    return;
  }
  console.log(
    `The following page(s) have been rendered inside '${pdfFilePath}': `
  );
  scanJobContent.elements.forEach((e) =>
    console.log(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} - ${e.width}x${
        e.height
      }`
    )
  );
}

function displayJpegScan(scanJobContent: ScanContent) {
  scanJobContent.elements.forEach((e) =>
    console.log(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} - ${e.width}x${
        e.height
      } - ${e.path}`
    )
  );
}

function isPdf(
  destination: WalkupScanDestination | WalkupScanToCompDestination
) {
  if (
    destination.shortcut === "SavePDF" ||
    destination.shortcut === "EmailPDF" ||
    destination.shortcut == "SaveDocument1"
  ) {
    return true;
  } else if (
    destination.shortcut === "SaveJPEG" ||
    destination.shortcut === "SavePhoto1"
  ) {
    return false;
  } else {
    console.log(
      `Unexpected shortcut received: ${destination.shortcut}, considering it as non pdf target!`
    );
    return false;
  }
}

async function saveScan(
  event: Event,
  folder: string,
  tempFolder: string,
  scanCount: number,
  deviceCapabilities: DeviceCapabilities,
  scanConfig: ScanConfig,
  filePattern: string | undefined
): Promise<void> {
  if (event.compEventURI) {
    const proceedToScan = await waitScanRequest(event.compEventURI);
    if (!proceedToScan) {
      return;
    }
  }

  const destination = await TryGetDestination(event);
  if (!destination) {
    console.log("No shortcut selected!");
    return;
  }
  console.log("Selected shortcut: " + destination.shortcut);

  let toPdf: boolean;
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  if (isPdf(destination)) {
    toPdf = true;
    contentType = "Document";
    destinationFolder = tempFolder;
    console.log(
      `Scan will be converted to pdf, using ${destinationFolder} as temp scan output directory for individual pages`
    );
  } else {
    toPdf = false;
    contentType = "Photo";
    destinationFolder = folder;
  }

  const isDuplex =
    destination.scanPlexMode != null && destination.scanPlexMode != "Simplex";
  console.log("ScanPlexMode is : " + destination.scanPlexMode);

  const scanStatus = await HPApi.getScanStatus();
  console.log("Afd is : " + scanStatus.adfState);

  const inputSource = scanStatus.getInputSource();

  const scanJobSettings = new ScanJobSettings(
    inputSource,
    contentType,
    scanConfig.resolution,
    isDuplex
  );

  const scanJobContent: ScanContent = { elements: [] };

  await executeScanJobs(
    scanJobSettings,
    inputSource,
    destinationFolder,
    scanCount,
    scanJobContent,
    event,
    deviceCapabilities,
    filePattern
  );

  console.log(
    `Scan of page(s) completed totalPages: ${scanJobContent.elements.length}:`
  );

  if (toPdf) {
    const pdfFilePath = await mergeToPdf(
      folder,
      scanCount,
      scanJobContent,
      filePattern
    );
    displayPdfScan(pdfFilePath, scanJobContent);
  } else {
    displayJpegScan(scanJobContent);
  }
}

async function readDeviceCapabilities(): Promise<DeviceCapabilities> {
  let supportsMultiItemScanFromPlaten = true;
  const discoveryTree = await HPApi.getDiscoveryTree();
  let walkupScanToCompCaps: WalkupScanToCompCaps | null = null;
  if (discoveryTree.WalkupScanToCompManifestURI != null) {
    const walkupScanToCompManifest = await HPApi.getWalkupScanToCompManifest(
      discoveryTree.WalkupScanToCompManifestURI
    );
    if (walkupScanToCompManifest.WalkupScanToCompCapsURI != null) {
      walkupScanToCompCaps = await HPApi.getWalkupScanToCompCaps(
        walkupScanToCompManifest.WalkupScanToCompCapsURI
      );
      supportsMultiItemScanFromPlaten =
        walkupScanToCompCaps.supportsMultiItemScanFromPlaten;
    }
  } else if (discoveryTree.WalkupScanManifestURI != null) {
    const walkupScanManifest = await HPApi.getWalkupScanManifest(
      discoveryTree.WalkupScanManifestURI
    );
    if (walkupScanManifest.walkupScanDestinationsURI != null) {
      await HPApi.getWalkupScanDestinations(
        walkupScanManifest.walkupScanDestinationsURI
      );
    }
  } else {
    console.log("Unknown device!");
  }

  if (discoveryTree.ScanJobManifestURI != null) {
    const scanJobManifest = await HPApi.getScanJobManifest(
      discoveryTree.ScanJobManifestURI
    );
    if (scanJobManifest.ScanCapsURI != null) {
      await HPApi.getScanCaps(scanJobManifest.ScanCapsURI);
    }
  }

  return {
    supportsMultiItemScanFromPlaten,
    useWalkupScanToComp: walkupScanToCompCaps != null,
  };
}

type DirectoryConfig = {
  directory: string | undefined;
  tempDirectory: string | undefined;
  filePattern: string | undefined;
};

type ScanConfig = {
  resolution: number;
};

type RegistrationConfig = {
  label: string;
};

let iteration = 0;
async function init(
  registrationConfig: RegistrationConfig,
  directoryConfig: DirectoryConfig,
  scanConfig: ScanConfig
) {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp();
  let deviceUp = true;

  const folder = await PathHelper.getOutputFolder(directoryConfig.directory);
  console.log(`Target folder: ${folder}`);

  const tempFolder = await PathHelper.getOutputFolder(
    directoryConfig.tempDirectory
  );
  console.log(`Temp folder: ${tempFolder}`);

  const deviceCapabilities = await readDeviceCapabilities();

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  while (keepActive) {
    console.log(`Running iteration: ${iteration} - errorCount: ${errorCount}`);
    try {
      let resourceURI: string;
      if (deviceCapabilities.useWalkupScanToComp) {
        resourceURI = await registerWalkupScanToCompDestination(
          registrationConfig
        );
      } else {
        resourceURI = await registerWalkupScanDestination(registrationConfig);
      }

      console.log("Waiting scan event for:", resourceURI);
      const event = await waitForScanEvent(resourceURI);

      scanCount++;
      console.log(`Scan event captured, saving scan #${scanCount}`);
      await saveScan(
        event,
        folder,
        tempFolder,
        scanCount,
        deviceCapabilities,
        scanConfig,
        directoryConfig.filePattern
      );
    } catch (e) {
      if (await HPApi.isAlive()) {
        errorCount++;
        console.error(e);
        console.log(e);
      } else {
        deviceUp = false;
      }
    }

    if (errorCount === 50) {
      keepActive = false;
    }

    if (!deviceUp) {
      await HPApi.waitDeviceUp();
    } else {
      await delay(1000);
    }
  }
}

function findOfficejetIp(deviceNamePrefix: string): Promise<string> {
  return new Promise((resolve) => {
    const bonjour = Bonjour();
    console.log("Searching printer...");
    let browser = bonjour.find(
      {
        type: "http",
      },
      (service) => {
        console.log(".");
        if (
          service.name.startsWith(deviceNamePrefix) &&
          service.port === 80 &&
          service.type === "http" &&
          service.addresses != null
        ) {
          browser.stop();
          bonjour.destroy();
          console.log(`Found: ${service.name}`);
          resolve(service.addresses[0]);
        }
      }
    );
    browser.start();
  });
}

function getConfig<T>(name: string): T | undefined {
  return config.has(name) ? config.get<T>(name) : undefined;
}

async function main() {
  const program = new Command();
  program.option(
    "-ip, --address <ip>",
    "IP address of the printer (this overrides -p)"
  );
  program.option(
    "-l, --label <label>",
    "The label to display on the printer (default is the hostname)"
  );
  program.option(
    "-n, --name <name>",
    "Name of the printer for service discovery"
  ); // i.e. 'Deskjet 3520 series'
  program.option(
    "-d, --directory <dir>",
    "Directory where scans are saved (defaults to /tmp/scan-to-pc<random>)"
  );
  program.option(
    "-t, --temp-directory <dir>",
    "Temp directory used for processing (defaults to /tmp/scan-to-pc<random>)"
  );
  program.option(
    "-p, --pattern <pattern>",
    'Pattern for filename (i.e. "scan"_dd.mm.yyyy_hh:MM:ss, without this its scanPage<number>)'
  );
  program.option(
    "-r, --resolution <dpi>",
    "Resolution in DPI of the scans (defaults is 200)"
  );
  program.option("-D, --debug", "Enable debug");
  program.parse(process.argv);

  let ip = program.opts().address || getConfig("ip");
  if (!ip) {
    const name = program.opts().name || getConfig("name");
    ip = await findOfficejetIp(name || "HP Smart Tank Plus 570 series");
  }
  console.log(`Using device ip: ${ip}`);

  const debug =
    program.opts().debug != null ? true : getConfig<boolean>("debug") || false;

  HPApi.setDebug(debug);
  HPApi.setPrinterIP(ip);

  const registrationConfig: RegistrationConfig = {
    label: program.opts().label || getConfig("label") || os.hostname(),
  };

  const directoryConfig: DirectoryConfig = {
    directory: program.opts().directory || getConfig("directory"),
    tempDirectory: program.opts().tempDirectory || getConfig("tempDirectory"),
    filePattern: program.opts().pattern || getConfig("pattern"),
  };

  const scanConfig: ScanConfig = {
    resolution: parseInt(
      program.opts().resolution || getConfig("resolution") || 200,
      10
    ),
  };
  await init(registrationConfig, directoryConfig, scanConfig);
}

main().catch((err) => console.log(err));
