"use strict";

const Destination = require("./destination");
const ScanJobSettings = require("./scanJobSettings");
const HPApi = require("./hpapi");
const os = require("os");
const console = require("console");

function delay(t) {
    return new Promise(function (resolve) {
        setTimeout(resolve, t);
    });
}

/**
 *
 * @param {String} resourceURI
 * @returns {Promise<Event>}
 */
function waitScanEvent(resourceURI) {
    console.log("Fetching old events");
    return HPApi.getEvents()
        .then(eventTable => {
            console.log("Start listening for new ScanEvent");
            return waitForScanEvent(resourceURI, eventTable.etag);
        });
}

let lastHandledAgingStamp = null;
/**
 *
 * @param resourceURI
 * @param etag
 * @returns {Promise<Event>}
 */
function waitForScanEvent(resourceURI, etag) {
    return HPApi.getEvents(etag, 1200)
        .then(eventTable => {
            let scanEvent = eventTable.eventTable.events.find(ev => ev.isScanEvent);

            if (scanEvent.resourceURI === resourceURI && scanEvent.agingStamp !== lastHandledAgingStamp) {
                lastHandledAgingStamp =  scanEvent.agingStamp;
                return scanEvent;
            }
            else {
                console.log("No scan event right now: " + eventTable.etag);
                return waitForScanEvent(resourceURI, eventTable.etag);
            }
        });
}

function waitPrinterUntilItIsReadyToUpload(jobUrl) {
    return delay(200)
        .then(() => HPApi.getJob(jobUrl))
        .then(job => {
            if (job.pageState === "ReadyToUpload") {
                return job;
            }

            return delay(200)
                .then(() => waitPrinterUntilItIsReadyToUpload(jobUrl));
        });
}

async function register() {
    const walkupScanDestinations = await HPApi.getWalkupScanDestinations();
    const hostname = os.hostname();

    let destinations = walkupScanDestinations.destinations;

    console.log("Host destinations fetched:", destinations.map(d => d.name));

    let destination = destinations.find(x => x.name === hostname);
    let resourceURI;
    if (destination) {
        console.log(`Re-using existing destination: ${hostname} - ${destination.resourceURI}`);
        resourceURI = destination.resourceURI;
    }
    else {
        resourceURI = await HPApi.registerDestination(new Destination(hostname, hostname));
        console.log(`New Destination registered: ${hostname} - ${resourceURI}`);
    }
    return resourceURI;
}

async function saveScan(event) {
    const destination = await HPApi.getDestination(event.resourceURI);

    console.log("Selected shortcut: " + destination.shortcut);
    const scanStatus = await HPApi.getScanStatus();
    console.log("Afd is : " + scanStatus.adfState);

    let inputSource = scanStatus.getInputSource();
    let contentType = destination.getContentType();

    let scanJobSettings = new ScanJobSettings(inputSource, contentType);
    const jobUrl = await HPApi.postJob(scanJobSettings);

    console.log("New job created:", jobUrl);

    const job = await waitPrinterUntilItIsReadyToUpload(jobUrl);

    console.log("Ready to download:", job.binaryURL);

    const filePath = await HPApi.downloadPage(job.binaryURL, "/tmp/scanPage1.jpg");

    console.log("Page downloaded to:", filePath);
}

async function init() {
    let keepActive = true;
    let errorCount = 0;
    while (keepActive) {
        try {
            let resourceURI = await register();

            console.log("Waiting scan event for:", resourceURI);
            const event = await waitScanEvent(resourceURI);
            console.log("Scan event captured");
            await saveScan(event);
        }
        catch (e) {
            errorCount++;
            console.error(e);
        }

        if (errorCount === 50) {
            keepActive = false;
        }

        await delay(1000);
    }
}

init();

