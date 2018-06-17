"use strict";

const WalkupScanDestination = require("./WalkupScanDestination");
const WalkupScanDestinations = require("./WalkupScanDestinations");
const ScanStatus = require("./ScanStatus");
const Job = require("./Job");
const EventTable = require("./EventTable");

const xml2js = require("xml2js");
const parser = new xml2js.Parser();
const url = require("url");
const axios = require("axios");
const fs = require("fs");
const util = require("util");

const parseString = util.promisify(parser.parseString);
let printerIP = "192.168.1.11";

module.exports = class HPApi {
  static setPrinterIP(ip) {
    printerIP = ip;
  }

  /**
   * @returns {Promise.<WalkupScanDestinations>}
   */
  static async getWalkupScanDestinations() {
    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: "/WalkupScan/WalkupScanDestinations",
      method: "GET",
      responseType: "text"
    });

    if (response.status !== 200) {
      throw new Error(response.statusMessage);
    } else {
      const parsed = await parseString(response.data);
      return new WalkupScanDestinations(parsed);
    }
  }

  /**
   * @params {WalkupScanDestination} walkupScanDestination
   * @returns {Promise.<boolean|Error>}
   */
  static async removeDestination(walkupScanDestination) {
    let urlInfo = url.parse(walkupScanDestination.resourceURI);

    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: urlInfo.pathname,
      method: "DELETE",
      responseType: "text"
    });
    if (response.status === 204) {
      return true;
    } else {
      throw response;
    }
  }

  /**
   *
   * @ {Promise.<String|Error>}
   */
  static async registerDestination(destination) {
    const xml = await destination.toXML();
    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: "/WalkupScan/WalkupScanDestinations",
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      data: xml,
      responseType: "text"
    });

    if (response.status === 201) {
      return response.headers.location;
    } else {
      throw response;
    }
  }

  /**
   *
   * @returns {Promise<{etag: string, eventTable: ?EventTable}>}
   */
  static async getEvents(etag = "", timeout = 0) {
    let url = this.appendTimeout(timeout, "/EventMgmt/EventTable");

    let headers = this.placeETagHeader(etag, {});

    let response;
    try {
      response = await axios({
        baseURL: `http://${printerIP}`,
        url: url,
        method: "GET",
        responseType: "text",
        headers: headers
      });
    } catch (error) {
      response = error.response;
      if (response.status === 304) {
        return {
          etag: etag,
          eventTable: new EventTable({})
        };
      }
      throw error;
    }

    const parsed = await parseString(response.data);
    return {
      etag: response.headers["etag"],
      eventTable: new EventTable(parsed)
    };
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

  static async getDestination(destinationURL) {
    const response = await axios({
      url: destinationURL,
      method: "GET",
      responseType: "text"
    });

    if (response.status !== 200) {
      throw response;
    } else {
      const parsed = await parseString(response.data);
      return new WalkupScanDestination(parsed);
    }
  }

  static async getScanStatus() {
    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: "/Scan/Status",
      method: "GET",
      responseType: "text"
    });

    if (response.status !== 200) {
      throw response;
    } else {
      const parsed = await parseString(response.data);
      return new ScanStatus(parsed);
    }
  }

  static delay(t) {
    return new Promise(function(resolve) {
      setTimeout(resolve, t);
    });
  }

  /**
   *
   * @param {ScanJobSettings} job
   * @return {*|Promise<String | Error>}
   */
  static async postJob(job) {
    await HPApi.delay(500);
    const xml = await job.toXML();
    const response = await axios({
      baseURL: `http://${printerIP}:8080`,
      url: "/Scan/Jobs",
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      data: xml,
      responseType: "text"
    });

    if (response.status === 201) {
      return response.headers.location;
    } else {
      throw response;
    }
  }

  /**
   * @param jobURL
   * @return {Promise<Job|*>}
   */
  static async getJob(jobURL) {
    const response = await axios({
      url: jobURL,
      method: "GET",
      responseType: "text"
    });

    if (response.status !== 200) {
      throw response;
    } else {
      const parsed = await parseString(response.data);
      return new Job(parsed);
    }
  }

  static async downloadPage(binaryURL, destination) {
    const response = await axios({
      baseURL: `http://${printerIP}:8080`,
      url: binaryURL,
      method: "GET",
      responseType: "stream"
    });

    response.data.pipe(fs.createWriteStream(destination));

    return new Promise((resolve, reject) => {
      response.data
        .on("end", () => resolve(destination))
        .on("error", error => reject(error));
    });
  }
};
