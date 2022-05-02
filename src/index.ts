#!/usr/bin/env node
"use strict";

import os from "os";
import fs from "fs/promises";
import path from "path";
import dateformat from "dateformat";
import { Command } from "commander";
import Bonjour from "bonjour";

import Destination from "./Destination";
import ScanJobSettings from "./ScanJobSettings";
import Event from "./Event";
import HPApi from "./HPApi";
import Job from "./Job";
import WalkupScanDestination from "./WalkupScanDestination";
import WalkupScanToCompDestination from "./WalkupScanToCompDestination";
import JpegUtil from "../src/JpegUtil";

const program = new Command();

function delay(t: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, t);
  });
}

async function waitForScanEvent(resourceURI: string): Promise<Event> {
  console.log("Start listening for new ScanEvent");

  let eventTable = await HPApi.getEvents();
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
  return resourceURI;
}

async function getNextFile(
  folder: string,
  currentPageNumber: string
): Promise<string> {
  const filePattern = program.opts().pattern;
  if (filePattern) {
    return path.join(folder, dateformat(new Date(), filePattern) + ".jpg");
  }

  return path.join(folder, `scanPage${currentPageNumber}.jpg`);
}

async function TryGetDestination(event: Event) {
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

async function fixJpegSize(filePath: string, size: { width: number; height: number }) {
  const buffer: Buffer = await fs.readFile(filePath);

  JpegUtil.SetJpgSize(buffer, size);

  await fs.writeFile(filePath, buffer);
}

async function handleProcessingState(job: Job, inputSource: "Adf" | "Platen") {
  if (
    job.pageState == "ReadyToUpload" &&
    job.binaryURL != null &&
    job.currentPageNumber != null
  ) {
    console.log(
      `Ready to download page ${job.currentPageNumber} at:`,
      job.binaryURL
    );

    let folder = program.opts().directory;
    if (!folder) {
      folder = await fs.mkdtemp(
        path.join(os.tmpdir(), "scan-to-pc")
      );
    }
    console.log(`Target folder: ${folder}`);

    const destinationFilePath = await getNextFile(
      folder,
      job.currentPageNumber
    );
    const filePath = await HPApi.downloadPage(
      job.binaryURL,
      destinationFilePath
    );
    console.log("Page downloaded to:", filePath);

    if (inputSource == "Adf") {
      if (job.imageHeight && job.imageWidth) {
        await fixJpegSize(filePath, { height: parseInt(job.imageHeight), width: parseInt(job.imageWidth) });
      }
    }

  } else {
    console.log(`Unknown pageState: ${job.pageState}`);
    await delay(200);
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

async function saveScan(event: Event): Promise<void> {
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

  let contentType = destination.getContentType();

  const scanStatus = await HPApi.getScanStatus();
  console.log("Afd is : " + scanStatus.adfState);

  let inputSource = scanStatus.getInputSource();

  let scanJobSettings = new ScanJobSettings(inputSource, contentType);
  const jobUrl = await HPApi.postJob(scanJobSettings);

  console.log("New job created:", jobUrl);

  let job = await HPApi.getJob(jobUrl);
  while (job.jobState !== "Completed") {
    job = await waitPrinterUntilItIsReadyToUploadOrCompleted(jobUrl);

    if (job.jobState == "Completed") {
      continue;
    }

    if (job.jobState === "Processing") {
      await handleProcessingState(job, inputSource);
    } else if (job.jobState === "Canceled") {
      console.log("Job cancelled by device");
      break;
    } else {
      console.log(`Unhandled jobState: ${job.jobState}`);
      await delay(200);
    }
  }
  console.log(`Job state: ${job.jobState}, totalPages: ${job.totalPageNumber}`);
}

let iteration = 0;
async function init() {
  let keepActive = true;
  let errorCount = 0;
  while (keepActive) {
    console.log(`Running iteration: ${iteration} - errorCount: ${errorCount}`);
    try {
      let resourceURI = await register();

      console.log("Waiting scan event for:", resourceURI);
      const event = await waitForScanEvent(resourceURI);

      console.log("Scan event captured, saving scan");
      await saveScan(event);
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
