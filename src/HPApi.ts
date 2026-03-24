"use strict";

import { promisify } from "util";
import fs from "fs";
import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type RawAxiosRequestHeaders,
} from "axios";
import * as stream from "node:stream";
import type Stream from "node:stream";
import EventTable, { type EtagEventTable } from "./hpModels/EventTable.js";
import Job from "./hpModels/Job.js";
import ScanStatus from "./hpModels/ScanStatus.js";
import WalkupScanDestination from "./hpModels/WalkupScanDestination.js";
import WalkupScanToCompDestination from "./hpModels/WalkupScanToCompDestination.js";
import WalkupScanDestinations from "./hpModels/WalkupScanDestinations.js";
import WalkupScanToCompDestinations from "./hpModels/WalkupScanToCompDestinations.js";
import type Destination from "./hpModels/Destination.js";
import WalkupScanToCompEvent from "./hpModels/WalkupScanToCompEvent.js";
import DiscoveryTree from "./type/DiscoveryTree.js";
import WalkupScanToCompManifest from "./hpModels/WalkupScanToCompManifest.js";
import WalkupScanToCompCaps from "./hpModels/WalkupScanToCompCaps.js";
import WalkupScanManifest from "./hpModels/WalkupScanManifest.js";
import ScanJobManifest from "./hpModels/ScanJobManifest.js";
import ScanCaps from "./hpModels/ScanCaps.js";
import { delay } from "./delay.js";
import * as net from "net";
import EsclScanJobManifest from "./hpModels/EsclManifest.js";
import EsclScanCaps from "./hpModels/EsclScanCaps.js";
import EsclScanStatus from "./hpModels/EsclScanStatus.js";
import type { IScanJobSettings } from "./hpModels/IScanJobSettings.js";
import EsclScanImageInfo from "./hpModels/EsclScanImageInfo.js";
import PathHelper from "./PathHelper.js";

let printerIP = "192.168.1.11";
let debug = false;
let callCount = 0;

export default class HPApi {
  static setDeviceIP(ip: string): void {
    printerIP = ip;
  }

  static setDebug(dbg: boolean): void {
    debug = dbg;
  }
  static isDebug(): boolean {
    return debug;
  }

  private static logDebug(
    callId: number,
    isRequest: boolean,
    msg: object | string,
  ): void {
    if (debug) {
      const id = String(callId).padStart(4, "0");
      const content = typeof msg === "string" ? msg : JSON.stringify(msg);
      console.log(id + (isRequest ? " -> " : " <- ") + content);
    }
  }

  private static async callAxios(
    request: AxiosRequestConfig,
  ): Promise<AxiosResponse<string>> {
    callCount++;
    if (request.timeout === 0) {
      request.timeout = 100_000;
    }
    HPApi.logDebug(callCount, true, request);
    try {
      const response = await axios(request);
      HPApi.logDebug(callCount, false, {
        status: response.status,
        data: response.data as unknown,
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

  static async isAlive(timeout: number | null = null): Promise<boolean> {
    const definedTimeout = timeout ?? 10000; // default of 10 seconds
    return new Promise((resolve) => {
      const socket = net.createConnection(80, printerIP, () => {
        clearTimeout(timer);
        resolve(true);
        socket.end();
      });
      const timer = setTimeout(() => {
        resolve(false);
        socket.end();
      }, definedTimeout);
      socket.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  static async waitDeviceUp(deviceUpPollingInterval: number): Promise<void> {
    let first = true;
    while (!(await HPApi.isAlive())) {
      if (first) {
        console.log(
          `Device ip: ${printerIP} is down! [${new Date().toISOString()}]`,
        );
      }
      first = false;
      await delay(deviceUpPollingInterval);
    }
    if (!first) {
      console.log(
        `Device ip: ${printerIP} is up again! [${new Date().toISOString()}]`,
      );
    }
  }

  static async getDiscoveryTree(): Promise<DiscoveryTree> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: "/DevMgmt/DiscoveryTree.xml",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return DiscoveryTree.createDiscoveryTree(response.data);
    }
  }

  static async getWalkupScanDestinations(
    uri = "/WalkupScan/WalkupScanDestinations",
  ): Promise<WalkupScanDestinations> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: uri,
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
        response.data,
      );
    }
  }

  static async getWalkupScanManifest(uri: string): Promise<WalkupScanManifest> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: uri,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return WalkupScanManifest.createWalkupScanManifest(response.data);
    }
  }
  static async getWalkupScanToCompManifest(
    uri: string,
  ): Promise<WalkupScanToCompManifest> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: uri,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return WalkupScanToCompManifest.createWalkupScanToCompManifest(
        response.data,
      );
    }
  }

  static async getScanJobManifest(uri: string): Promise<ScanJobManifest> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: uri,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return ScanJobManifest.createScanJobManifest(response.data);
    }
  }

  static async getEsclScanJobManifest(
    uri: string,
  ): Promise<EsclScanJobManifest> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: uri,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return EsclScanJobManifest.createScanJobManifest(response.data);
    }
  }

  static async getScanCaps(uri: string): Promise<ScanCaps> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: uri,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return ScanCaps.createScanCaps(response.data);
    }
  }

  static async getEsclScanCaps(uri: string): Promise<EsclScanCaps> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: uri,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return EsclScanCaps.createScanCaps(response.data);
    }
  }

  static async getWalkupScanToCompCaps(
    uri: string,
  ): Promise<WalkupScanToCompCaps> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: uri,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(response.statusText);
    } else {
      return WalkupScanToCompCaps.createWalkupScanToCompCaps(response.data);
    }
  }

  static async getWalkupScanToCompEvent(
    compEventURI: string,
  ): Promise<WalkupScanToCompEvent> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: compEventURI,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(
        `Unexpected status code when getting ${compEventURI}: ${response.status}`,
      );
    } else {
      return WalkupScanToCompEvent.createWalkupScanToCompEvent(response.data);
    }
  }

  static async removeDestination(
    walkupScanDestination: WalkupScanDestination | WalkupScanToCompDestination,
  ): Promise<boolean> {
    const path = PathHelper.getPathFromHttpLocation(
      walkupScanDestination.resourceURI,
    );

    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: path,
      method: "DELETE",
      responseType: "text",
    });
    if (response.status === 204 || response.status === 200) {
      return true;
    } else {
      throw new Error(
        `Unexpected status code when removing ${path}: ${response.status}`,
      );
    }
  }

  static async registerWalkupScanDestination(
    destination: Destination,
  ): Promise<string> {
    const xml = await destination.toXML();
    const url = "/WalkupScan/WalkupScanDestinations";
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: url,
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      data: xml,
      responseType: "text",
    });

    if (
      response.status === 201 &&
      typeof response.headers["location"] === "string"
    ) {
      return PathHelper.getPathFromHttpLocation(response.headers["location"]);
    } else {
      throw new Error(
        `Unexpected status code when getting ${url}: ${response.status}`,
      );
    }
  }
  static async registerWalkupScanToCompDestination(
    destination: Destination,
  ): Promise<string> {
    const xml = await destination.toXML();
    const url = "/WalkupScanToComp/WalkupScanToCompDestinations";
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: url,
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      data: xml,
      responseType: "text",
    });

    if (
      response.status === 201 &&
      typeof response.headers["location"] === "string"
    ) {
      return PathHelper.getPathFromHttpLocation(response.headers["location"]);
    } else {
      throw new Error(
        `Unexpected status code or location when registering to ${url}: ${response.status} - ${response.headers["location"]}`,
      );
    }
  }

  static async getEvents(
    etag = "",
    decisecondTimeout = 0,
  ): Promise<EtagEventTable> {
    const url = this.appendTimeout("/EventMgmt/EventTable", decisecondTimeout);

    const headers = this.placeETagHeader(etag, {});

    let response: AxiosResponse<string>;
    try {
      response = await HPApi.callAxios({
        baseURL: `http://${printerIP}`,
        url: url,
        method: "GET",
        responseType: "text",
        headers: headers,
        timeout: decisecondTimeout * 100 * 1.1,
      });
    } catch (error) {
      const axiosError = error as AxiosError;

      if (!axiosError.isAxiosError) {
        throw error;
      }

      if (axiosError.response?.status === 304) {
        return {
          etag: etag,
          eventTable: new EventTable({}),
        };
      }
      throw error;
    }

    const etagReceived = response.headers["etag"] as unknown;
    if (typeof etagReceived !== "string") {
      throw new Error("Missing etag when getting Job");
    }

    const content = response.data;
    return EventTable.createEtagEventTable(content, etagReceived);
  }

  static placeETagHeader(
    etag: string,
    headers: RawAxiosRequestHeaders,
  ): RawAxiosRequestHeaders {
    if (etag !== "") {
      headers["If-None-Match"] = etag;
    }
    return headers;
  }

  static appendTimeout(url: string, timeout: number | null = null): string {
    timeout ??= 1200;
    if (timeout > 0) {
      url += "?timeout=" + timeout;
    }
    return url;
  }

  static async getDestination(
    destinationURL: string,
  ): Promise<WalkupScanDestination | WalkupScanToCompDestination> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: destinationURL,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(
        `Unexpected status code when getting ${destinationURL}: ${response.status}`,
      );
    } else {
      const content = response.data;
      if (destinationURL.includes("WalkupScanToComp")) {
        return WalkupScanToCompDestination.createWalkupScanToCompDestination(
          content,
        );
      } else {
        return WalkupScanDestination.createWalkupScanDestination(content);
      }
    }
  }

  static async getScanStatus(): Promise<ScanStatus> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: "/Scan/Status",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(
        `Unexpected status code when getting /Scan/Status: ${response.status}`,
      );
    } else {
      const content = response.data;
      return ScanStatus.createScanStatus(content);
    }
  }

  static async getEsclScanStatus(): Promise<EsclScanStatus> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: "/eSCL/ScannerStatus",
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(
        `Unexpected status code when getting /eSCL/ScannerStatus : ${response.status}`,
      );
    } else {
      const content = response.data;
      return EsclScanStatus.createScanStatus(content);
    }
  }

  static delay(t: number): Promise<void> {
    return new Promise(function (resolve) {
      setTimeout(resolve, t);
    });
  }

  static async postJob(job: IScanJobSettings): Promise<string> {
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

    if (
      response.status === 201 &&
      typeof response.headers["location"] === "string"
    ) {
      return response.headers["location"];
    } else {
      throw new Error(
        `Unexpected status code or location when posting job: ${response.status} - ${response.headers["location"]}`,
      );
    }
  }

  static async postEsclJob(job: IScanJobSettings): Promise<string> {
    await HPApi.delay(500);
    const xml = await job.toXML();
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: "/eSCL/ScanJobs",
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      data: xml,
      responseType: "text",
    });

    if (
      response.status === 201 &&
      typeof response.headers["location"] === "string"
    ) {
      return response.headers["location"];
    } else {
      throw new Error(
        `Unexpected status code or location when posting job: ${response.status} - ${response.headers["location"]}`,
      );
    }
  }
  /**
   * @param jobURL
   * @return {Promise<Job|*>}
   */
  static async getJob(jobURL: string): Promise<Job> {
    const response = await HPApi.callAxios({
      url: jobURL,
      method: "GET",
      responseType: "text",
    });

    if (response.status !== 200) {
      throw new Error(
        `Unexpected status code when getting ${jobURL}: ${response.status}`,
      );
    } else {
      const content = response.data;
      return Job.createJob(content);
    }
  }

  static async downloadPage(
    binaryURL: string,
    destination: string,
    timeout?: number,
  ): Promise<string> {
    const { data }: AxiosResponse<Stream> = await axios.request<Stream>({
      baseURL: `http://${printerIP}:8080`,
      url: binaryURL,
      method: "GET",
      responseType: "stream",
      ...(timeout !== undefined && { timeout }),
    });

    const destinationFileStream = fs.createWriteStream(destination);
    data.pipe(destinationFileStream);

    await promisify(stream.finished)(destinationFileStream);

    return destination;
  }

  static async esclWaitDeviceBusy<T>(fn: () => Promise<T>): Promise<T> {
    let i = 0;
    do {
      i++;
      try {
        return await fn();
      } catch (error) {
        if (error instanceof AxiosError && error.status === 503) {
          console.log("Waiting, device is busy");
          await HPApi.delay(1000);
          continue;
        }
        throw error;
      }
    } while (i < 30);
    throw new Error(`Failed, max retries reached: ${i}`);
  }

  static async downloadEsclPage(
    jobUri: string,
    destination: string,
  ): Promise<string> {
    return await HPApi.esclWaitDeviceBusy(
      async () =>
        await HPApi.downloadPage(jobUri + "/NextDocument", destination, 60_000),
    );
  }

  static async getEsclScanImageInfo(
    jobUri: string,
  ): Promise<EsclScanImageInfo> {
    return await HPApi.esclWaitDeviceBusy(async () => {
      const response = await HPApi.callAxios({
        baseURL: `http://${printerIP}`,
        url: jobUri + "/ScanImageInfo",
        method: "GET",
        responseType: "text",
      });

      if (response.status !== 200) {
        throw new Error(
          `Unexpected status code when getting /eSCL/ScannerStatus : ${response.status}`,
        );
      } else {
        const content = response.data;
        return EsclScanImageInfo.createScanImageInfo(content);
      }
    });
  }
}
