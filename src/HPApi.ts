"use strict";

import { promisify } from "util";
import fs from "fs";
import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosRequestHeaders,
  AxiosResponse,
} from "axios";
import { URL } from "url";
import * as stream from "stream";
import { Stream } from "stream";
import EventTable from "./EventTable";
import Job, { JobData } from "./Job";
import ScanStatus from "./ScanStatus";
import WalkupScanDestination from "./WalkupScanDestination";
import WalkupScanToCompDestination from "./WalkupScanToCompDestination";
import WalkupScanDestinations from "./WalkupScanDestinations";
import WalkupScanToCompDestinations from "./WalkupScanToCompDestinations";
import ScanJobSettings from "./ScanJobSettings";
import Destination from "./Destination";
import WalkupScanToCompEvent from "./WalkupScanToCompEvent";

import { Parser } from "xml2js";
const parser = new Parser();
const parseString = promisify<string, any>(parser.parseString);
let printerIP = "192.168.1.11";
let debug = false;
let callCount = 0;

export interface EtagEventTable {
  etag: string;
  eventTable: EventTable;
}

export default class HPApi {
  static setPrinterIP(ip: string) {
    printerIP = ip;
  }

  static setDebug(dbg: boolean) {
    debug = dbg;
  }

  private static logDebug(callId: number, isRequest: boolean, msg: any) {
    if (debug) {
      const id = String(callId).padStart(4, "0");
      const content = typeof msg === "string" ? msg : JSON.stringify(msg);
      console.log(id + (isRequest ? " -> " : " <- ") + content);
    }
  }

  private static async callAxios(request: AxiosRequestConfig) {
    callCount++;
    HPApi.logDebug(callCount, true, request);
    try {
      const response = (await axios(request)) as AxiosResponse<string>;
      HPApi.logDebug(callCount, false, {
        status: response.status,
        data: response.data,
        headers: response.headers,
        statusText: response.statusText,
      });
      return response;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.isAxiosError) {
        HPApi.logDebug(callCount, false, {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          headers: axiosError.response?.headers,
          statusText: axiosError.response?.statusText,
        });
      }
      throw error;
    }
  }

  static async getWalkupScanDestinations(): Promise<WalkupScanDestinations> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: "/WalkupScan/WalkupScanDestinations",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return WalkupScanDestinations.createWalkupScanDestinations(response.data);
    }
  }

  static async getWalkupScanToCompDestinations(): Promise<WalkupScanToCompDestinations> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: "/WalkupScanToComp/WalkupScanToCompDestinations",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return WalkupScanToCompDestinations.createWalkupScanToCompDestinations(
        response.data
      );
    }
  }

  static async getWalkupScanToCompCaps(): Promise<boolean> {
    return HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: "/WalkupScanToComp/WalkupScanToCompCaps",
      method: "GET",
      responseType: "text",
    }).then(
      (response) => response.status == 200,
      () => false
    );
  }

  static async getWalkupScanToCompEvent(
    compEventURI: string
  ): Promise<WalkupScanToCompEvent> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: compEventURI,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw response;
    } else {
      return WalkupScanToCompEvent.createWalkupScanToCompEvent(response.data);
    }
  }

  static async removeDestination(walkupScanDestination: WalkupScanDestination) {
    let urlInfo = new URL(walkupScanDestination.resourceURI);

    if (urlInfo.pathname === null) {
      throw new Error(
        `invalid walkupScanDestination.resourceURI: ${walkupScanDestination.resourceURI}`
      );
    }

    const response = await HPApi.callAxios({
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
    const response = await HPApi.callAxios({
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

  static async getEvents(etag = "", timeout = 0): Promise<EtagEventTable> {
    let url = this.appendTimeout("/EventMgmt/EventTable", timeout);

    let headers = this.placeETagHeader(etag, {});

    let response: AxiosResponse<string>;
    try {
      response = await HPApi.callAxios({
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

    const etagReceived = response.headers["etag"];
    const content = response.data;
    return EventTable.createEtagEventTable(content, etagReceived);
  }

  static placeETagHeader(etag: string, headers: AxiosRequestHeaders) {
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

  static async getDestination(
    destinationURL: string
  ): Promise<WalkupScanDestination | WalkupScanToCompDestination> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: destinationURL,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw response;
    } else {
      const content = response.data;
      if (destinationURL.includes("WalkupScanToComp")) {
        return WalkupScanToCompDestination.createWalkupScanToCompDestination(
          content
        );
      } else {
        return WalkupScanDestination.createWalkupScanDestination(content);
      }
    }
  }

  static async getScanStatus() {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: "/Scan/Status",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw response;
    } else {
      let content = response.data;
      return ScanStatus.createScanStatus(content);
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
    const response = await HPApi.callAxios({
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
    const response = await HPApi.callAxios({
      url: jobURL,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw response;
    } else {
      const content = response.data;
      return this.createJob(content);
    }
  }

  static async createJob(content: string): Promise<Job> {
    const parsed = (await parseString(content)) as JobData;
    return new Job(parsed);
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

    await promisify(stream.finished)(destinationFileStream);

    return destination;
  }
}
