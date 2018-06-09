"use strict";

const WalkupScanDestination = require("./walkupScanDestination");
const WalkupScanDestinations = require("./walkupScanDestinations");
const ScanStatus = require("./scanStatus");
const Job = require("./job");
const EventTable = require("./eventTable");

const xml2js = require("xml2js");
const parser = new xml2js.Parser();
const url = require("url");
const axios = require("axios");
const Promise = require("promise");
const fs = require("fs");
const console = require("console");

const parseString = Promise.denodeify(parser.parseString);
const printerIP = "192.168.1.11";

module.exports = class HPApi {

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
        url = this.appendTimeout(timeout, url);

        let headers = {};
        headers = this.placeETagHeader(etag, headers);

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

    static placeETagHeader(etag, headers) {
        if (etag !== "") {
            headers = {
                "If-None-Match": etag
            };
        }
        return headers;
    }

    static appendTimeout(timeout, url) {
        if (timeout == null) {
            timeout = 1200;
        }
        if (timeout > 0) {
            url += "?timeout=" + timeout;
        }
        return url;
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
};