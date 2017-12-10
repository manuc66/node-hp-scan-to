"use strict";

const http = require("http");
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const printerIP = "192.168.1.7";
const destinationName = "node-scan-watch";

function getWalkupScanDestinations(callback) {
    let wlkDsts = '';
    let request = http.request(
        {
            "hostname": printerIP,
            "path": "/WalkupScan/WalkupScanDestinations"
        }, (response) => {

            response.on("data", chunk => {
                wlkDsts += chunk.toString();
            });

            response.on("end", () => {
                parser.parseString(wlkDsts, callback);
            });
        });
    request.end();
}

function waitForEvent() {
    console.log("need watch for event");
}

function registerMeAsADestination() {
    console.log("need to register");
}

/**
 *
 * @param {WalkupScanDestinations} walkupScanDestinations
 * @param {String} destinationName
 * @returns {boolean}
 */
function hasDestination(walkupScanDestinations, destinationName) {
    return walkupScanDestinations["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"].some(x => x["dd:Name"].some(name => name === destinationName ));
}

function init() {
    getWalkupScanDestinations((err, result) => {
        if (err) {
            setTimeout(init, 1000);
        }
        else {
            if (hasDestination(result, destinationName)) {
                waitForEvent();
            }
            else {
                registerMeAsADestination();
            }
        }
    });
}

init();

