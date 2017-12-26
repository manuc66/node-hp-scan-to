"use strict";

const xml2js = require("xml2js");
const parser = new xml2js.Parser();
const url = require("url");
const axios = require("axios");
const Promise = require("promise");

const parseString = Promise.denodeify(parser.parseString);
const printerIP = "192.168.1.7";


class WalkupScanDestination {
    constructor(data) {
        this.data = data;
    }

    get name() {
        return this.data["dd:Name"][0];
    }

    get hostname() {
        return this.data["dd:ResourceURI"][0];
    }

    get resourceURI() {
        return this.data["dd:ResourceURI"][0];
    }

    get shortcut() {
        return this.data["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"]["0"]["wus:WalkupScanSettings"]["0"]["wus:Shortcut"][0];
    }
}

class WalkupScanDestinations {
    constructor(data) {
        this.data = data;
    }

    /**
     *
     * @returns {WalkupScanDestination[]}
     */
    get destinations() {
        let walkupScanDestinations = this.data["wus:WalkupScanDestinations"];
        if (walkupScanDestinations.hasOwnProperty("wus:WalkupScanDestination")) {
            return walkupScanDestinations["wus:WalkupScanDestination"].map(x => new WalkupScanDestination(x));
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
                method: "GET",
                responseType: "text"
            })
            .then(response => {
                return new Promise((resolve, reject) => {

                    if (response.status !== 200) {
                        reject(response.statusMessage);
                    }
                    else {
                        return parseString(response.data)
                            .then((parsed) => {
                                resolve(new WalkupScanDestinations(parsed));
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
                method: "DELETE",
                responseType: "text"
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
                        method: "POST",
                        headers: {"Content-Type": "text/xml"},
                        data: xml,
                        responseType: "text"
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

    /**
     *
     * @returns {Promise<{etag: string, eventTable: EventTable}>}
     */
    static getEvents(etag = "", timeout = 0) {

        let url = "/EventMgmt/EventTable";
        if (timeout > 0) {
            url += "?timeout=" + (timeout ? timeout : 1200);
        }

        let headers = {};
        if (etag !== "") {
            headers = {
                "If-None-Match": etag
            };
        }

        return axios(
            {
                baseURL: `http://${printerIP}`,
                url: url,
                method: "GET",
                responseType: "text",
                headers: headers,

            })
            .catch(reason => console.error(reason))
            .then(response => {
                return new Promise((resolve, reject) => {
                    if (response.status !== 200) {
                        reject(response.statusMessage);
                    }
                    else {
                        return parseString(response.data)
                            .then((parsed) => resolve({etag: response.headers["ETag"], eventTable: new EventTable(parsed)}));
                    }
                });
            });
    }

    static getDestination(resourceURI) {
        return axios(
            {
                url: resourceURI,
                method: "GET",
                responseType: "text"
            })
            .catch(reason => console.error(reason))
            .then(response => {
                return new Promise((resolve, reject) => {

                    if (response.status !== 200) {
                        reject(response.statusMessage);
                    }
                    else {
                        return parseString(response.data)
                            .then(parsed => {
                                resolve(new WalkupScanDestination(parsed));
                            });
                    }
                });
            });
    }
}

class EventTable {

    constructor(data) {
        this.data = data;
    }

    /**
     *
     * @returns {Event[]}
     */
    get events() {
        let eventTable = this.data["ev:EventTable"];
        if (eventTable.hasOwnProperty("ev:Event")) {
            return eventTable["ev:Event"].map(x => new Event(x));
        }
        else {
            return [];
        }

    }
}

class Event {
    constructor(data) {
        this.data = data;
    }

    /**
     *
     * @returns {String}
     */
    get unqualifiedEventCategory() {
        return this.data["dd:UnqualifiedEventCategory"][0];
    }

    get resourceURI() {
        return this.data["ev:Payload"]["0"]["dd:ResourceURI"]["0"];
    }

    /**
     *
     * @returns {boolean}
     */
    get isScanEvent() {
        return this.unqualifiedEventCategory === "ScanEvent";
    }
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

module.exports.HPApi = HPApi;
module.exports.Destination = Destination;