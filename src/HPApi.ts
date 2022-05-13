"use strict";

import WalkupScanDestination, {
  WalkupScanDestinationData,
} from "./WalkupScanDestination";
import WalkupScanToCompDestination, {
  WalkupScanToCompDestinationData,
} from "./WalkupScanToCompDestination";
import { promisify } from "util";
import fs from "fs";
import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosRequestHeaders,
  AxiosResponse,
} from "axios";
import { URL } from "url";
import { Parser } from "xml2js";
import * as stream from "stream";
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
import WalkupScanToCompEvent, {
  WalkupScanToCompEventData,
} from "./WalkupScanToCompEvent";

const parser = new Parser();
const parseString = promisify<string, any>(parser.parseString);
let printerIP = "192.168.1.11";
let debug = false;
let callCount = 0;

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
      return HPApi.createWalkupScanDestinations(response.data);
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
      return HPApi.createWalkupScanToCompDestinations(response.data);
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
      return HPApi.createWalkupScanToCompEvent(response.data);
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

  static async getEvents(
    etag = "",
    timeout = 0
  ): Promise<{ etag: string; eventTable: EventTable }> {
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

    const parsed = await parseString(response.data);
    return {
      etag: response.headers["etag"],
      eventTable: new EventTable(parsed as EventTableData),
    };
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
        return this.createWalkupScanToCompDestination(content);
      } else {
        return this.createWalkupScanDestination(content);
      }
    }
  }
  static async createWalkupScanDestinations(
    content: string
  ): Promise<WalkupScanDestinations> {
    const parsed = (await parseString(content)) as WalkupScanDestinationsData;
    return new WalkupScanDestinations(parsed);
  }
  static async createWalkupScanToCompDestinations(
    content: string
  ): Promise<WalkupScanToCompDestinations> {
    const parsed = (await parseString(
      content
    )) as WalkupScanToCompDestinationsData;
    return new WalkupScanToCompDestinations(parsed);
  }

  static async createWalkupScanDestination(
    content: string
  ): Promise<WalkupScanDestination> {
    const parsed = (await parseString(content)) as {
      "wus:WalkupScanDestinations":{"wus:WalkupScanDestination": WalkupScanDestinationData[]};
    };
    return new WalkupScanDestination(parsed["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"][0]);
  }

  static async createWalkupScanToCompDestination(
    content: string
  ): Promise<WalkupScanToCompDestination> {
    const parsed = (await parseString(content)) as {
      "wus:WalkupScanToCompDestination": WalkupScanToCompDestinationData;
    };
    return new WalkupScanToCompDestination(
      parsed["wus:WalkupScanToCompDestination"]
    );
  }

  static async createWalkupScanToCompEvent(content: string) {
    const parsed = (await parseString(content)) as WalkupScanToCompEventData;
    return new WalkupScanToCompEvent(parsed);
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

    await promisify(stream.finished)(destinationFileStream);

    return destination;
  }
}
