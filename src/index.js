"use strict";

const http = require("http");
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const printerIP = "192.168.1.7";
const destinationName = "node-scan-watch";

class HPApi {


    /**
     * @returns {Promise.<String|Error>}
     */
    static getWalkupScanDestinations() {
        return new Promise((resolve, reject) => {
            let wlkDsts = '';
            let request = http.request(
                {
                    "hostname": printerIP,
                    "path": "/WalkupScan/WalkupScanDestinations"
                }, (response) => {
                    response.on("data", chunk => {
                        wlkDsts += chunk.toString();
                    });

                    if (response.statusCode === 200) {
                        response.on("end", () => {
                            parser.parseString(wlkDsts, (err, result) => {
                                if (err) {
                                    reject(err);
                                }
                                else {
                                    resolve(result);
                                }
                            });
                        });
                    }
                    else {
                        response.on('end', reject)
                    }
                });
            request.end();
        })
    }

    /**
     *
     * @ {Promise.<String|Error>}
     */
    static registerDestination(destination) {
        return new Promise((resolve, reject) => {
            destination.toXML()
                .catch(reason => reject(reason))
                .then(xml => {
                    let request = http.request(
                        {
                            hostname: printerIP,
                            method: "POST",
                            path: "/WalkupScan/WalkupScanDestinations",
                            headers: {
                                'Content-Type': 'text/xml',
                            }
                        }, response => {
                            response.on('data', () => true);

                            let cb;
                            if (response.statusCode === 201) {
                                cb = () => resolve(response.headers.location);
                            }
                            else {
                                console.error(response.statusMessage);

                                cb = () => reject({
                                    statusCode: response.statusCode,
                                    statusMessage: response.statusMessage
                                });
                            }

                            response.on('end', cb);
                        });
                    request.write(xml);
                    request.end();
                })
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
     * @returns {Promise.<String|Error>}
     */
    toXML() {
        let rawDestination = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
            "<WalkupScanDestination xmlns=\"http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" \n" +
            "xsi:schemaLocation=\"http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd\">\n" +
            "<Hostname xmlns=\"http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06\"></Hostname>\n" +
            "<Name xmlns=\"http://www.hp.com/schemas/imaging/con/dictionaries/1.0/\"></Name>\n" +
            "<LinkType>Network</LinkType>\n" +
            "</WalkupScanDestination>";


        return new Promise((resolve, reject) => {
            parser.parseString(rawDestination, (err, parsed) => {
                if (err) {
                    reject(err);
                }
                else {
                    parsed.WalkupScanDestination.Hostname[0]._ = this.name;
                    parsed.WalkupScanDestination.Name[0]._ = this.hostname;
                    parsed.WalkupScanDestination.LinkType[0] = this.linkType;

                    let builder = new xml2js.Builder();
                    let xml = builder.buildObject(parsed);
                    resolve(xml);
                }
            });
        });
    }
}

/**
 *
 * @param {Destination} destination
 */
function registerMeAsADestination(destination) {
    HPApi.registerDestination(destination)
        .catch(reason => console.error(reason))
        .then(location => console.log(location))
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
    HPApi.getWalkupScanDestinations()
        .catch(reason => {
            console.error(reason);
            setTimeout(init, 1000);
        })
        .then(value => {
            if (hasDestination(value, destinationName)) {
                waitForEvent();
            }
            else {
                registerMeAsADestination(new Destination("TEST", getHostname()));
            }
        });
}

init();

