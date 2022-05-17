#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import os from "os";
import fs from "fs/promises";
import { Command } from "commander";
import Bonjour from "bonjour";

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

const program = new Command();

function delay(t: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, t);
  });
}

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

async function register(): Promise<string> {
  let destination;
  const hostname = os.hostname();
  const toComp = await HPApi.getWalkupScanToCompCaps();

  if (toComp) {
    const walkupScanDestinations =
      await HPApi.getWalkupScanToCompDestinations();
    const destinations = walkupScanDestinations.destinations;

    console.log(
      "Host destinations fetched:",
      destinations.map((d) => d.name).join(", ")
    );

    destination = destinations.find((x) => x.name === hostname);
  } else {
    const walkupScanDestinations = await HPApi.getWalkupScanDestinations();
    const destinations = walkupScanDestinations.destinations;

    console.log(
      "Host destinations fetched:",
      destinations.map((d) => d.name).join(", ")
    );

    destination = destinations.find((x) => x.name === hostname);
  }

  let resourceURI;
  if (destination) {
    console.log(
      `Re-using existing destination: ${hostname} - ${destination.resourceURI}`
    );
    resourceURI = destination.resourceURI;
  } else {
    resourceURI = await HPApi.registerDestination(
      new Destination(hostname, hostname, toComp),
      toComp
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
      if (shortcut !== "") {
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
  currentPageNumber: number
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
      program.opts().pattern,
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
  scanJobContent: ScanContent
): Promise<"Completed" | "Canceled"> {
  const jobUrl = await HPApi.postJob(scanJobSettings);

  console.log("New job created:", jobUrl);

  let currentPage: ScanPage | null = null;
  let job = await HPApi.getJob(jobUrl);
  while (job.jobState !== "Completed") {
    job = await waitPrinterUntilItIsReadyToUploadOrCompleted(jobUrl);

    if (job.jobState == "Completed") {
      if (currentPage != null) {
        scanJobContent.elements.push(currentPage);
      }
      continue;
    }

    if (job.jobState === "Processing") {
      currentPage = await handleProcessingState(
        job,
        inputSource,
        folder,
        scanCount,
        scanJobContent.elements.length + 1
      );
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
  firstEvent: Event
): Promise<"Completed" | "Canceled"> {
  let jobState = await executeScanJob(
    scanJobSettings,
    inputSource,
    folder,
    scanCount,
    scanJobContent
  );
  let lastEvent = firstEvent;
  if (
    jobState === "Completed" &&
    lastEvent.compEventURI &&
    inputSource !== "Adf" &&
    lastEvent.destinationURI
  ) {
    lastEvent = await waitForScanEvent(
      lastEvent.destinationURI,
      lastEvent.agingStamp
    );
    if (!lastEvent.compEventURI) {
      return jobState;
    }
    let startNewScanJob = await waitScanNewPageRequest(lastEvent.compEventURI);
    while (startNewScanJob) {
      jobState = await executeScanJob(
        scanJobSettings,
        inputSource,
        folder,
        scanCount,
        scanJobContent
      );
      if (jobState !== "Completed") {
        return jobState;
      }
      if (!lastEvent.destinationURI) {
        break;
      }
      lastEvent = await waitForScanEvent(
        lastEvent.destinationURI,
        lastEvent.agingStamp
      );
      if (!lastEvent.compEventURI) {
        return jobState;
      }
      startNewScanJob = await waitScanNewPageRequest(lastEvent.compEventURI);
    }
  }
  return jobState;
}

async function mergeToPdf(
  jobState: "Completed" | "Canceled",
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent
) {
  const pdfFilePath = PathHelper.getFileForScan(
    folder,
    scanCount,
    program.opts().pattern,
    "pdf"
  );
  if (jobState == "Completed") {
    await createPdfFrom(scanJobContent, pdfFilePath);
  } else {
    console.log(`No pdf generated because job has been cancelled`);
  }
  scanJobContent.elements.forEach((e) => fs.unlink(e.path));
  return pdfFilePath;
}

function displayPdfScan(pdfFilePath: string, scanJobContent: ScanContent) {
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

async function saveScan(
  event: Event,
  folder: string,
  scanCount: number
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

  const contentType = destination.getContentType();
  const toPdf =
    destination.shortcut === "SavePDF" || destination.shortcut === "EmailPDF";

  const isDuplex =
    destination.scanPlexMode != null && destination.scanPlexMode != "Simplex";
  console.log("ScanPlexMode is : " + destination.scanPlexMode);

  const scanStatus = await HPApi.getScanStatus();
  console.log("Afd is : " + scanStatus.adfState);

  const inputSource = scanStatus.getInputSource();

  const scanJobSettings = new ScanJobSettings(
    inputSource,
    contentType,
    isDuplex
  );

  const scanJobContent: ScanContent = { elements: [] };

  const jobState = await executeScanJobs(
    scanJobSettings,
    inputSource,
    folder,
    scanCount,
    scanJobContent,
    event
  );

  console.log(
    `Scan of page(s) completed totalPages: ${scanJobContent.elements.length}:`
  );

  if (toPdf) {
    const pdfFilePath = await mergeToPdf(
      jobState,
      folder,
      scanCount,
      scanJobContent
    );
    displayPdfScan(pdfFilePath, scanJobContent);
  } else {
    displayJpegScan(scanJobContent);
  }
}

let iteration = 0;
async function init() {
  const folder = await PathHelper.getOutputFolder(program.opts().directory);
  console.log(`Target folder: ${folder}`);

  let scanCount = 0;

  let keepActive = true;
  let errorCount = 0;
  while (keepActive) {
    console.log(`Running iteration: ${iteration} - errorCount: ${errorCount}`);
    try {
      let resourceURI = await register();

      console.log("Waiting scan event for:", resourceURI);
      const event = await waitForScanEvent(resourceURI);

      scanCount++;
      console.log(`Scan event captured, saving scan #${scanCount}`);
      await saveScan(event, folder, scanCount);
    } catch (e) {
      errorCount++;
      console.error(e);
      console.log(e);
    }

    if (errorCount === 50) {
      keepActive = false;
    }

    await delay(1000);
  }
}

function findOfficejetIp(): Promise<string> {
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
          service.name.startsWith(program.opts().name) &&
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

async function main() {
  program.option(
    "-ip, --address <ip>",
    "IP address of the printer (this overrides -p)"
  );
  program.option(
    "-n, --name <name>",
    "Name of the printer for service discovery",
    "HP Smart Tank Plus 570 series"
  ); //or i.e. 'Deskjet 3520 series'
  program.option(
    "-d, --directory <dir>",
    "Directory where scans are saved (defaults to /tmp/scan-to-pc<random>)"
  );
  program.option(
    "-p, --pattern <pattern>",
    'Pattern for filename (i.e. "scan"_dd.mm.yyyy_hh:MM:ss, without this its scanPage<number>)'
  );
  program.option("-D, --debug", "Enable debug");
  program.parse(process.argv);

  let ip = program.opts().address || "192.168.1.53";
  if (!ip) {
    ip = await findOfficejetIp();
  }

  const debug = program.opts().debug != null;

  HPApi.setDebug(debug);
  HPApi.setPrinterIP(ip);
  await init();
}

main();
