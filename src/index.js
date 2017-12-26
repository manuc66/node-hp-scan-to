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
    return HPApi.getEvents()
        .then(eventTable => {
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

/**
 *
 * @param {Destination} destination
 * @return {Promise}
 */
function registerMeAsADestination(destination) {
    return HPApi.registerDestination(destination)
        .catch(reason => console.error(reason));
}

function init() {
    HPApi.getWalkupScanDestinations()
        .then(walkupScanDestinations => {
            const hostname = os.hostname();

            let destination = walkupScanDestinations.destinations.find(x => x.name === hostname);
            if (destination) {
                return destination.resourceURI;
            }

            return registerMeAsADestination(new Destination(hostname, hostname));
        })
        .then((resourceURI) => {
            waitScanEvent(resourceURI)
                .then(event => {
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

