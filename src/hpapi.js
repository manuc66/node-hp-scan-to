"use strict";

const xml2js = require("xml2js");
const parser = new xml2js.Parser();
const url = require("url");
const axios = require("axios");
const Promise = require("promise");
const fs = require("fs");
const console = require("console");

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

class ScanStatus {
    constructor(data) {
        this.data = data;
    }

    get scannerState() {
        return this.data["ScanStatus"].ScannerState["0"];
    }

    get adfState() {
        return this.data["ScanStatus"].AdfState["0"];
    }
}

class Job {
    constructor(data) {
        this.data = data;
    }

    get pageNumber() {
        return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].PageNumber["0"];
    }

    get jobState() {
        return this.data["j:Job"]["j:JobState"][0];
    }

    get pageState() {
        return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].PageState["0"];
    }

    get binaryURL() {
        return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].BinaryURL["0"];
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
                            .then((parsed) => resolve({
                                etag: response.headers["ETag"],
                                eventTable: new EventTable(parsed)
                            }));
                    }
                });
            });
    }

    static getDestination(destinationURL) {
        return axios(
            {
                url: destinationURL,
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


    static getScanStatus() {
        return axios(
            {
                baseURL: `http://${printerIP}`,
                url: "/Scan/Status",
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
                                resolve(new ScanStatus(parsed));
                            });
                    }
                });
            });
    }


    static delay(t) {
        return new Promise(function (resolve) {
            setTimeout(resolve, t);
        });
    }

    /**
     *
     * @param {ScanJobSettings} job
     * @return {*|Promise<String | Error>}
     */
    static postJob(job) {
        return HPApi.delay(500)
            .then(() => job.toXML())
            .then(xml => {
                return axios(
                    {
                        baseURL: `http://${printerIP}:8080`,
                        url: "/Scan/Jobs",
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

    static getJob(jobURL) {
        return axios(
            {
                url: jobURL,
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
                                resolve(new Job(parsed));
                            });
                    }
                });
            });
    }

    static downloadPage(binaryURL, destination) {
        return axios(
            {
                baseURL: `http://${printerIP}:8080`,
                url: binaryURL,
                method: "GET",
                responseType: "stream"
            })
            .then(function (response) {
                response.data
                    .pipe(fs.createWriteStream(destination));

                return new Promise((resolve, reject) => {
                    response.data
                        .on("end", () => resolve(destination))
                        .on("error", reject);
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

class ScanJobSettings {


    constructor(inputSource, contentType) {
        this.inputSource = inputSource;
        this.contentType = contentType;
    }

    /**
     * Do something.
     * @returns {Promise.<String|Error>}
     */
    toXML() {
        let rawJob = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
            "<ScanSettings xmlns=\"http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19 Scan Schema - 0.26.xsd\">\n" +
            "\t<XResolution>200</XResolution>\n" +
            "\t<YResolution>200</YResolution>\n" +
            "\t<XStart>33</XStart>\n" +
            "\t<YStart>0</YStart>\n" +
            "\t<Width>2481</Width>\n" +
            "\t<Height>3507</Height>\n" +
            "\t<Format>Jpeg</Format>\n" +
            "\t<CompressionQFactor>0</CompressionQFactor>\n" +
            "\t<ColorSpace>Color</ColorSpace>\n" +
            "\t<BitDepth>8</BitDepth>\n" +
            "\t<InputSource>Adf</InputSource>\n" +
            "\t<GrayRendering>NTSC</GrayRendering>\n" +
            "\t<ToneMap>\n" +
            "\t\t<Gamma>1000</Gamma>\n" +
            "\t\t<Brightness>1000</Brightness>\n" +
            "\t\t<Contrast>1000</Contrast>\n" +
            "\t\t<Highlite>179</Highlite>\n" +
            "\t\t<Shadow>25</Shadow>\n" +
            "\t\t<Threshold>0</Threshold>\n" +
            "\t</ToneMap>\n" +
            "\t<SharpeningLevel>128</SharpeningLevel>\n" +
            "\t<NoiseRemoval>0</NoiseRemoval>\n" +
            "\t<ContentType>Document</ContentType>\n" +
            "</ScanSettings>";


        return new Promise((resolve, reject) => {
            parser.parseString(rawJob, (err, parsed) => {
                if (err) {
                    reject(err);
                }
                else {

                    parsed.ScanSettings.InputSource[0] = this.inputSource;
                    parsed.ScanSettings.ContentType[0] = this.contentType;

                    let builder = new xml2js.Builder({
                        xmldec: {"version": "1.0", "encoding": "UTF-8", "standalone": null},
                        renderOpts: {"pretty": true, "indent": "\t", "newline": "\n"}
                    });
                    resolve(builder.buildObject(parsed));
                }
            });
        });
    }
}

module.exports.HPApi = HPApi;
module.exports.Destination = Destination;
module.exports.ScanJobSettings = ScanJobSettings;