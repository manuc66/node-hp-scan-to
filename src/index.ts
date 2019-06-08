"use strict";

import Destination from "./Destination";
import ScanJobSettings from "./ScanJobSettings";
import Event from "./Event";
import HPApi from "./HPApi";
import * as os from "os";
import Job from "./Job";

import Bonjour, { Service } from "bonjour";

function delay(t: number) {
  return new Promise(function(resolve) {
    setTimeout(resolve, t);
  });
}

/**
 *
 * @param resourceURI
 * @returns {Promise<Event>}
 */
async function waitForScanEvent(resourceURI: string): Promise<Event> {
  console.log("Start listening for new ScanEvent");

  let eventTable = await HPApi.getEvents();
  let acceptedScanEvent = null;
  let currentEtag = eventTable.etag;
  while (acceptedScanEvent == null) {
    eventTable = await HPApi.getEvents(currentEtag, 1200);
    currentEtag = eventTable.etag;

    acceptedScanEvent = eventTable.eventTable.events.find(
      ev => ev.isScanEvent && ev.resourceURI === resourceURI
    );
  }
  return acceptedScanEvent;
}

async function waitPrinterUntilItIsReadyToUpload(jobUrl: string): Promise<Job> {
  let job = null;
  let isReadyToUpload = false;
  do {
    job = await HPApi.getJob(jobUrl);
    isReadyToUpload = job.pageState === "ReadyToUpload";
    await delay(200);
  } while (!isReadyToUpload);
  return job;
}

async function register() {
  const walkupScanDestinations = await HPApi.getWalkupScanDestinations();
  const hostname = os.hostname();

  let destinations = walkupScanDestinations.destinations;

  console.log("Host destinations fetched:", destinations.map(d => d.name));

  let destination = destinations.find(x => x.name === hostname);
  let resourceURI;
  if (destination) {
    console.log(
      `Re-using existing destination: ${hostname} - ${destination.resourceURI}`
    );
    resourceURI = destination.resourceURI;
  } else {
    resourceURI = await HPApi.registerDestination(
      new Destination(hostname, hostname)
    );
    console.log(`New Destination registered: ${hostname} - ${resourceURI}`);
  }
  return resourceURI;
}

function getNextFile(job: Job): string {
  return `/tmp/scanPage${job.currentPageNumber}.jpg`;
}

async function saveScan(event: Event) {
  const destination = await HPApi.getDestination(event.resourceURI);

  console.log("Selected shortcut: " + destination.shortcut);
  const scanStatus = await HPApi.getScanStatus();
  console.log("Afd is : " + scanStatus.adfState);

  let inputSource = scanStatus.getInputSource();
  let contentType = destination.getContentType();

  let scanJobSettings = new ScanJobSettings(inputSource, contentType);
  const jobUrl = await HPApi.postJob(scanJobSettings);

  console.log("New job created:", jobUrl);

  let job = await HPApi.getJob(jobUrl);
  while (job.jobState !== "Completed") {
    job = await waitPrinterUntilItIsReadyToUpload(jobUrl);
    console.log("Ready to download:", job.binaryURL);

    const filePath = await HPApi.downloadPage(job.binaryURL, getNextFile(job));
    console.log("Page downloaded to:", filePath);
    job = await HPApi.getJob(jobUrl);
  }
  console.log(`Job state: ${job.jobState}, totalPages: ${job.totalPageNumber}`);
}

async function init() {
  let keepActive = true;
  let errorCount = 0;
  while (keepActive) {
    try {
      let resourceURI = await register();

      console.log("Waiting scan event for:", resourceURI);
      const event = await waitForScanEvent(resourceURI);
      console.log("Scan event captured");
      await saveScan(event);
    } catch (e) {
      errorCount++;
      console.error(e);
    }

    if (errorCount === 50) {
      keepActive = false;
    }

    await delay(1000);
  }
}

interface OfficeJetBonjourService extends Service {
  addresses?: string[];
}

function findOfficejetIp() : Promise<string> {
  return new Promise(resolve => {
    const bonjour = Bonjour();
    bonjour.find({}, (service: OfficeJetBonjourService) => {
      if (
        service.name.startsWith("Officejet 6500 E710n-z") &&
        service.port === 80 &&
        service.type === "http" &&
        service.addresses != null
      ) {
        bonjour.destroy();
        console.log(`Found: ${service.name}`);
        resolve(service.addresses[0]);
      }
    });
  });
}

async function main() {
  const ip = await findOfficejetIp();
  HPApi.setPrinterIP(ip);
  await init();
}

main();
