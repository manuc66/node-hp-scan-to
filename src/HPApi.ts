"use strict";

import { promisify } from "util";
import fs from "fs";
import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  RawAxiosRequestHeaders,
} from "axios";
import * as stream from "stream";
import { Stream } from "stream";
import EventTable, { EtagEventTable } from "./hpModels/EventTable";
import Job from "./hpModels/Job";
import ScanStatus from "./hpModels/ScanStatus";
import WalkupScanDestination from "./hpModels/WalkupScanDestination";
import WalkupScanToCompDestination from "./hpModels/WalkupScanToCompDestination";
import WalkupScanDestinations from "./hpModels/WalkupScanDestinations";
import WalkupScanToCompDestinations from "./hpModels/WalkupScanToCompDestinations";
import Destination from "./hpModels/Destination";
import WalkupScanToCompEvent from "./hpModels/WalkupScanToCompEvent";
import DiscoveryTree from "./type/DiscoveryTree";
import WalkupScanToCompManifest from "./hpModels/WalkupScanToCompManifest";
import WalkupScanToCompCaps from "./hpModels/WalkupScanToCompCaps";
import WalkupScanManifest from "./hpModels/WalkupScanManifest";
import ScanJobManifest from "./hpModels/ScanJobManifest";
import ScanCaps from "./hpModels/ScanCaps";
import { delay } from "./delay";
import * as net from "net";
import EsclScanJobManifest from "./hpModels/EsclManifest";
import EsclScanCaps from "./hpModels/EsclScanCaps";
import EsclScanStatus from "./hpModels/EsclScanStatus";
import { IScanJobSettings } from "./hpModels/IScanJobSettings";
import EsclScanImageInfo from "./hpModels/EsclScanImageInfo";
import PathHelper from "./PathHelper";
import logger, { getLoggerForFile } from "./logger";

let printerIP = "192.168.1.11";
let callCount = 0;

export default class HPApi {
  private static logger = getLoggerForFile(__filename);
  static setDeviceIP(ip: string): void {
    printerIP = ip;
  }

  private static logDebug(
    callId: number,
    isRequest: boolean,
    msg: object | string,
  ): void {
    if (!logger.isLevelEnabled("debug")) return;

    const id = String(callId).padStart(4, "0");
    const prefix = id + (isRequest ? " -> " : " <- ");
    const content = typeof msg === "string" ? msg : JSON.stringify(msg);

    this.logger.debug({ callId, isRequest, msg }, prefix + content);
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
    const definedTimeout = timeout || 10000; // default of 10 seconds
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
        logger.info(
          `Device ip: ${printerIP} is down! [${new Date().toISOString()}]`,
        );
      }
      first = false;
      await delay(deviceUpPollingInterval);
    }
    if (!first) {
      logger.info(
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
    uri: string = "/WalkupScan/WalkupScanDestinations",
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
    if (response.status === 204 || response.status == 200) {
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
      typeof response.headers.location === "string"
    ) {
      return PathHelper.getPathFromHttpLocation(response.headers.location);
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
      typeof response.headers.location === "string"
    ) {
      return PathHelper.getPathFromHttpLocation(response.headers.location);
    } else {
      throw new Error(
        `Unexpected status code or location when registering to ${url}: ${response.status} - ${response.headers.location}`,
      );
    }
  }

  static async getEvents(
    etag: string = "",
    decisecondTimeout: number = 0,
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

      if (!axiosError.isAxiosError) throw error;

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
    if (timeout == null) {
      timeout = 1200;
    }
    if (timeout > 0) {
      url += `?timeout=${timeout}`;
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
      url: "/eSCL/ScannerStatus ",
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
      typeof response.headers.location === "string"
    ) {
      return response.headers.location;
    } else {
      throw new Error(
        `Unexpected status code or location when posting job: ${response.status} - ${response.headers.location}`,
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
      typeof response.headers.location === "string"
    ) {
      return response.headers.location;
    } else {
      throw new Error(
        `Unexpected status code or location when posting job: ${response.status} - ${response.headers.location}`,
      );
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
      timeout,
    });

    const destinationFileStream = fs.createWriteStream(destination);
    data.pipe(destinationFileStream);

    await promisify(stream.finished)(destinationFileStream);

    return destination;
  }

  static async downloadEsclPage(
    jobUri: string,
    destination: string,
  ): Promise<string> {
    return await HPApi.downloadPage(
      `${jobUri}/NextDocument`,
      destination,
      60_000,
    );
  }

  static async getEsclScanImageInfo(
    jobUri: string,
  ): Promise<EsclScanImageInfo> {
    const response = await HPApi.callAxios({
      baseURL: `http://${printerIP}`,
      url: `${jobUri}/ScanImageInfo`,
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
  }
}
