"use strict";

const {HPApi, Destination} = require("./hpapi");
const Promise = require("promise");
const os = require("os");

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

            waitScanEvent(resourceURI)
                .then(event => {
                    console.log("Scan event captured");
                    return HPApi.getDestination(event.resourceURI);
                })
                .then(dest => {

                    console.log(dest);
                });
        })
        .catch(reason => {
            console.error(reason);
            setTimeout(init, 1000);
        });
}

init();

