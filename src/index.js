"use strict";

const http = require("http");
const xml2js = require('xml2js');
const parser = new xml2js.Parser();
const url = require('url');
const axios = require('axios');
const Promise = require('promise');

const parseString = Promise.denodeify(parser.parseString);

const printerIP = "192.168.1.7";
const destinationName = "node-scan-watch";


class WalkupScanDestination {
    get name() {
        return this["dd:Name"][0];
    }

    get hostname() {
        return this["dd:ResourceURI"][0];
    }

    get resourceURI() {
        return this["dd:ResourceURI"][0];
    }
}

class WalkupScanDestinations {

    /**
     *
     * @returns {WalkupScanDestination[]}
     */
    get destinations() {
        let walkupScanDestinations = this["wus:WalkupScanDestinations"];
        if (walkupScanDestinations.hasOwnProperty("wus:WalkupScanDestination")) {
            return walkupScanDestinations["wus:WalkupScanDestination"].map(x => Object.assign(WalkupScanDestination.prototype, x));
        }
        else {
            return [];
        }

    }
}

class HPApi {

    /**
     * @returns {Promise.<WalkupScanDestinations>}
     */
    static getWalkupScanDestinations() {
        return axios(
            {
                baseURL: `http://${printerIP}`,
                url: "/WalkupScan/WalkupScanDestinations",
                method: 'GET',
                responseType: 'text'
            })
            .then(response => {
                return new Promise((resolve, reject) => {

                    if (response.status !== 200) {
                        reject(response.statusMessage);
                    }
                    else {
                        return parseString(response.data)
                            .then((parsed) => {
                                resolve(Object.assign(WalkupScanDestinations.prototype, parsed));
                            });
                    }
                });
            });
    }

    /**
     * @params {WalkupScanDestination} walkupScanDestination
     * @returns {Promise.<boolean|Error>}
     */
    static removeDestination(walkupScanDestination) {
        let urlInfo = url.parse(walkupScanDestination.resourceURI);

        return axios(
            {
                baseURL: `http://${printerIP}`,
                url: urlInfo.pathname,
                method: 'DELETE',
                responseType: 'text'
            })
            .then(response => {
                return new Promise((resolve, reject) => {
                    if (response.status === 204) {
                        resolve(true);
                    }
                    else {
                        reject(response.statusText);
                    }
                });
            });
    }

    /**
     *
     * @ {Promise.<String|Error>}
     */
    static registerDestination(destination) {
        return destination.toXML()
            .then(xml => {
                return axios(
                    {
                        baseURL: `http://${printerIP}`,
                        url: "/WalkupScan/WalkupScanDestinations",
                        method: 'POST',
                        headers: {'Content-Type': 'text/xml'},
                        data: xml,
                        responseType: 'text'
                    })
                    .then(response => {
                        return new Promise((resolve, reject) => {
                            if (response.status === 201) {
                                resolve(response.headers.location);
                            }
                            else {
                                reject(response.statusText);
                            }
                        });
                    });
            });
    }
}

/**
 *
 * @param {WalkupScanDestination} destination
 */
function waitForEvent(destination) {
    console.log("Destination:", destination.name, "is ready");
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
                    parsed.WalkupScanDestination.Hostname[0]._ = this.hostname;
                    parsed.WalkupScanDestination.Name[0]._ = this.name;
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
        .then(location => console.log("New destination registered: " + location));
}

/**
 *
 * @param {WalkupScanDestinations} walkupScanDestinations
 * @param {String} destinationName
 * @returns {WalkupScanDestination}
 */
function getDestination(walkupScanDestinations, destinationName) {
    return walkupScanDestinations.destinations.find(x => x.name === destinationName);
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


            let destination = getDestination(value, destinationName);
            if (destination) {
                waitForEvent(destination);
            }
            else {
                registerMeAsADestination(new Destination(destinationName, getHostname()));
            }


            // cleanup all dests
            value.destinations.map(x => {
                HPApi.removeDestination(x)
                    .catch(reason => console.error(reason))
                    .then(value2 => console.log(value2));
            });

        });
}

init();

