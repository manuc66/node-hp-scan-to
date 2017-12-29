"use strict";

const {HPApi, Destination, ScanJobSettings} = require("./hpapi");
const Promise = require("promise");
const os = require("os");

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

            if (scanEvent.resourceURI === resourceURI) {
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

function init() {
    HPApi.getWalkupScanDestinations()
        .then(walkupScanDestinations => {
            const hostname = os.hostname();

            let destinations = walkupScanDestinations.destinations;

            console.log("Destination fetched:", destinations.map(d => d.name));

            let destination = destinations.find(x => x.name === hostname);
            if (destination) {
                console.log(`Re-using existing destination: ${hostname} - ${destination.resourceURI}`);
                return destination.resourceURI;
            }

            return HPApi.registerDestination(new Destination(hostname, hostname)).then(resourceURI => {
                console.log(`New Destination registered: ${hostname} - ${resourceURI}`);
                return resourceURI;
            });
        })
        .then(resourceURI => {
            console.log("Waiting scan event for:", resourceURI);

            let scanType;
            waitScanEvent(resourceURI)
                .then(event => {
                    console.log("Scan event captured");
                    return HPApi.getDestination(event.resourceURI);
                })
                .then(dest => {
                    console.log("Selected shortcut: " + dest.shortcut);
                    scanType = dest.shortcut;
                    return HPApi.getScanStatus();
                })
                .then(scanStatus => {
                    console.log("Afd is : " + scanStatus.adfState);
                    let inputSource = scanStatus.adfState === "Loaded" ? "Adf" : "Platen";
                    let contentType = scanType === "SavePDF" ? "Document" : "Photo";
                    let scanJobSettings = new ScanJobSettings(inputSource, contentType);
                    return HPApi.postJob(scanJobSettings);
                })
                .then(jobUrl => {
                    console.log("New job created:", jobUrl);

                    return waitPrinterUntilItIsReadyToUpload(jobUrl);
                })
                .then(job => {
                    console.log("Ready to download:", job.binaryURL);

                    return HPApi.downloadPage(job.binaryURL, "/tmp/scanPage1.jpg");
                })
                .then(filePath => {
                    console.log("Page downloaded to:", filePath);
                });
        })
        .catch(reason => {
            console.error(reason);
            setTimeout(init, 1000);
        });
}

init();

