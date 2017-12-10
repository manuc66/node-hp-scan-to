"use strict";

const http = require("http");
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const printerIP = "192.168.1.7";
const destinationName = "node-scan-watch";

class HPApi {
    static getWalkupScanDestinations(callback) {
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

    /**
     *
     * @param {Destination} destination
     * @param callback
     */
    static registerDestination(destination, callback) {
        destination.toXML((err, xml) => {

            let request = http.request(
                {
                    hostname: printerIP,
                    method: "POST",
                    path: "/WalkupScan/WalkupScanDestinations",
                    headers: {
                        'Content-Type': 'text/xml',
                    }
                }, response => {
                    if (response.statusCode === 201) {

                            callback(null, response.headers.location);
                    }
                    else {
                        console.error(response.statusMessage);

                            callback({statusCode: response.statusCode, statusMessage: response.statusMessage}, null);

                    }
                    request.abort();
                });
            request.write(xml);
            request.end();

        });
    }
}

function waitForEvent() {
    console.log("need watch for event");
}

class Destination {
    constructor(name, hostname) {
        this.name = name;
        this.hostname = hostname;
        this.linkType = "Network";
    }

    /**
     * Callback used by myFunction.
     * @callback Destination~toXmlCallback
     * @param {error} err
     * @param {?string} xml
     */

    /**
     * Do something.
     * @param {Destination~toXmlCallback} cb - Called on success.
     */
    toXML(cb) {
        let rawDestination = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
            "<WalkupScanDestination xmlns=\"http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" \n" +
            "xsi:schemaLocation=\"http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd\">\n" +
            "<Hostname xmlns=\"http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06\"></Hostname>\n" +
            "<Name xmlns=\"http://www.hp.com/schemas/imaging/con/dictionaries/1.0/\"></Name>\n" +
            "<LinkType>Network</LinkType>\n" +
            "</WalkupScanDestination>";

        parser.parseString(rawDestination, (err, parsed) => {
            if (err) {
                cb(err, null);
            }
            else {
                parsed.WalkupScanDestination.Hostname[0]._ = this.name;
                parsed.WalkupScanDestination.Name[0]._ = this.hostname;
                parsed.WalkupScanDestination.LinkType[0] = this.linkType;

                let builder = new xml2js.Builder();
                let xml = builder.buildObject(parsed);
                cb(err, xml);
            }
        });
    }
}

/**
 *
 * @param {Destination} destination
 */
function registerMeAsADestination(destination) {
    HPApi.registerDestination(destination, (err, location) => {
        if(err) {
            console.error(JSON.stringify(err));
        }
        else {
            console.log(location);
        }
    });
}

/**
 *
 * @param {WalkupScanDestinations} walkupScanDestinations
 * @param {String} destinationName
 * @returns {boolean}
 */
function hasDestination(walkupScanDestinations, destinationName) {
    return walkupScanDestinations["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"].some(x => x["dd:Name"].some(name => name === destinationName));
}

function getHostname() {
    return "192.168.1.12";
}

function init() {
    HPApi.getWalkupScanDestinations((err, result) => {
        if (err) {
            setTimeout(init, 1000);
        }
        else {
            if (hasDestination(result, destinationName)) {
                waitForEvent();
            }
            else {
                registerMeAsADestination(new Destination("TEST", getHostname()));
            }
        }
    });
}

init();

