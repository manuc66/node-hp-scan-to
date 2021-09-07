"use strict";

import WalkupScanDestination, {
  WalkupScanDestinationData,
} from "./WalkupScanDestination";
import WalkupScanToCompDestination, {
  WalkupScanToCompDestinationData,
} from "./WalkupScanToCompDestination";
import util from "util";
import fs from "fs";
import axios, { AxiosError, AxiosResponse } from "axios";
import { URL } from "url";
import xml2js from "xml2js";
import EventTable, { EventTableData } from "./EventTable";
import Job, { JobData } from "./Job";
import ScanStatus, { ScanStatusData } from "./ScanStatus";
import WalkupScanDestinations, {
  WalkupScanDestinationsData,
} from "./WalkupScanDestinations";
import WalkupScanToCompDestinations, {
  WalkupScanToCompDestinationsData,
} from "./WalkupScanToCompDestinations";
import ScanJobSettings from "./ScanJobSettings";
import Destination from "./Destination";
import { Stream } from "stream";

const parser = new xml2js.Parser();
const parseString = util.promisify<string, any>(parser.parseString);
let printerIP = "192.168.1.11";

export default class HPApi {
  static setPrinterIP(ip: string) {
    printerIP = ip;
  }

  static async getWalkupScanDestinations(): Promise<WalkupScanDestinations> {
    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: "/WalkupScan/WalkupScanDestinations",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      const parsed = (await parseString(
        response.data
      )) as WalkupScanDestinationsData;
      return new WalkupScanDestinations(parsed);
    }
  }

  static async getWalkupScanToCompDestinations(): Promise<WalkupScanToCompDestinations> {
    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: "/WalkupScanToComp/WalkupScanToCompDestinations",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      const parsed = (await parseString(
        response.data
      )) as WalkupScanToCompDestinationsData;
      return new WalkupScanToCompDestinations(parsed);
    }
  }

  static async getWalkupScanToCompCaps(): Promise<boolean> {
    return axios({
      baseURL: `http://${printerIP}`,
      url: "/WalkupScanToComp/WalkupScanToCompCaps",
      method: "GET",
      responseType: "text",
    }).then(
      (response) => response.status == 200,
      () => false
    );
  }

  static async removeDestination(walkupScanDestination: WalkupScanDestination) {
    let urlInfo = new URL(walkupScanDestination.resourceURI);

    if (urlInfo.pathname === null) {
      throw new Error(
        `invalid walkupScanDestination.resourceURI: ${walkupScanDestination.resourceURI}`
      );
    }

    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: urlInfo.pathname,
      method: "DELETE",
      responseType: "text",
    });
    if (response.status === 204) {
      return true;
    } else {
      throw response;
    }
  }

  static async registerDestination(destination: Destination, toComp: boolean) {
    let xml = await destination.toXML();
    let url = "/WalkupScan/WalkupScanDestinations";
    if (toComp) {
      url = "/WalkupScanToComp/WalkupScanToCompDestinations";
    }
    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: url,
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      data: xml,
      responseType: "text",
    });

    if (response.status === 201) {
      return new URL(response.headers.location).pathname;
    } else {
      throw response;
    }
  }

  static async getEvents(
    etag = "",
    timeout = 0
  ): Promise<{ etag: string; eventTable: EventTable }> {
    let url = this.appendTimeout("/EventMgmt/EventTable", timeout);

    let headers = this.placeETagHeader(etag, {});

    let response: AxiosResponse;
    try {
      response = await axios({
        baseURL: `http://${printerIP}`,
        url: url,
        method: "GET",
        responseType: "text",
        headers: headers,
      });
    } catch (error) {
      const axiosError = error as AxiosError;

      if (!axiosError.isAxiosError) throw error;

      if (axiosError.response?.status === 304) {
        return {
          etag: etag,
          eventTable: new EventTable({}),
        };
      }
      throw error;
    }

    const parsed = await parseString(response.data);
    return {
      etag: response.headers["etag"],
      eventTable: new EventTable(parsed as EventTableData),
    };
  }

  static placeETagHeader(etag: string, headers: object) {
    if (etag !== "") {
      headers = {
        "If-None-Match": etag,
      };
    }
    return headers;
  }

  static appendTimeout(url: string, timeout: number | null = null): string {
    if (timeout == null) {
      timeout = 1200;
    }
    if (timeout > 0) {
      url += "?timeout=" + timeout;
    }
    return url;
  }

  static async getDestination(destinationURL: string) {
    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: destinationURL,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw response;
    } else {
      if (destinationURL.includes("WalkupScanToComp")) {
        const parsed = (await parseString(
          response.data
        )) as WalkupScanToCompDestinationData;
        return new WalkupScanToCompDestination(parsed);
      } else {
        const parsed = (await parseString(
          response.data
        )) as WalkupScanDestinationData;
        return new WalkupScanDestination(parsed);
      }
    }
  }

  static async getScanStatus() {
    const response = await axios({
      baseURL: `http://${printerIP}`,
      url: "/Scan/Status",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw response;
    } else {
      const parsed = (await parseString(response.data)) as ScanStatusData;
      return new ScanStatus(parsed);
    }
  }

  static delay(t: number) {
    return new Promise(function (resolve) {
      setTimeout(resolve, t);
    });
  }

  static async postJob(job: ScanJobSettings) {
    await HPApi.delay(500);
    const xml = await job.toXML();
    const response = await axios({
      baseURL: `http://${printerIP}:8080`,
      url: "/Scan/Jobs",
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      data: xml,
      responseType: "text",
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
  static async getJob(jobURL: string) {
    const response = await axios({
      url: jobURL,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw response;
    } else {
      const parsed = (await parseString(response.data)) as JobData;
      return new Job(parsed);
    }
  }

  static async downloadPage(
    binaryURL: string,
    destination: string
  ): Promise<string> {
    const { data }: AxiosResponse<Stream> = await axios.request<Stream>({
      baseURL: `http://${printerIP}:8080`,
      url: binaryURL,
      method: "GET",
      responseType: "stream",
    });

    const destinationFileStream = fs.createWriteStream(destination);
    data.pipe(destinationFileStream);

    return new Promise((resolve, reject) => {
      data
        .on("end", () => {
          resolve(destination);
        })
        .on("error", (error: Error) => reject(error));
    });
  }
}
