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

export default class DeviceClient {
  readonly deviceIP: string;
  readonly debug: boolean;
  private callCount = 0;

  constructor(deviceIP: string, debug = false) {
    this.deviceIP = deviceIP;
    this.debug = debug;
  }

  isDebug(): boolean {
    return this.debug;
  }

  private logDebug(
    callId: number,
    isRequest: boolean,
    msg: object | string,
  ): void {
    if (this.debug) {
      const id = String(callId).padStart(4, "0");
      const content = typeof msg === "string" ? msg : JSON.stringify(msg);
      console.log(id + (isRequest ? " -> " : " <- ") + content);
    }
  }

  private async callAxios<T = string>(
    request: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    this.callCount++;

    if (request.timeout === 0) {
      request.timeout = 100_000;
    }
    this.logDebug(this.callCount, true, request);
    try {
      const response = await axios({
        ...request,
        adapter: "http",
      });
      this.logDebug(this.callCount, false, {
        status: response.status,
        data: response.data as unknown,
        headers: response.headers,
        statusText: response.statusText,
      });
      return response;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.isAxiosError) {
        this.logDebug(this.callCount, false, {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          headers: axiosError.response?.headers,
          statusText: axiosError.response?.statusText,
        });
      }
      throw error;
    }
  }

  async isAlive(timeout: number | null = null): Promise<boolean> {
    const definedTimeout = timeout ?? 10000;
    return new Promise((resolve) => {
      const socket = net.createConnection(80, this.deviceIP, () => {
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

  async waitDeviceUp(deviceUpPollingInterval: number): Promise<void> {
    let first = true;
    while (!(await this.isAlive())) {
      if (first) {
        console.log(
          `Device ip: ${this.deviceIP} is down! [${new Date().toISOString()}]`,
        );
      }
      first = false;
      await delay(deviceUpPollingInterval);
    }
    if (!first) {
      console.log(
        `Device ip: ${this.deviceIP} is up again! [${new Date().toISOString()}]`,
      );
    }
  }

  async getDiscoveryTree(): Promise<DiscoveryTree> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getWalkupScanDestinations(
    uri = "/WalkupScan/WalkupScanDestinations",
  ): Promise<WalkupScanDestinations> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getWalkupScanToCompDestinations(): Promise<WalkupScanToCompDestinations> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getWalkupScanManifest(uri: string): Promise<WalkupScanManifest> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getWalkupScanToCompManifest(
    uri: string,
  ): Promise<WalkupScanToCompManifest> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getScanJobManifest(uri: string): Promise<ScanJobManifest> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getEsclScanJobManifest(
    uri: string,
  ): Promise<EsclScanJobManifest> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getScanCaps(uri: string): Promise<ScanCaps> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getEsclScanCaps(uri: string): Promise<EsclScanCaps> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getWalkupScanToCompCaps(
    uri: string,
  ): Promise<WalkupScanToCompCaps> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getWalkupScanToCompEvent(
    compEventURI: string,
  ): Promise<WalkupScanToCompEvent> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async removeDestination(
    walkupScanDestination: WalkupScanDestination | WalkupScanToCompDestination,
  ): Promise<boolean> {
    const path = PathHelper.getPathFromHttpLocation(
      walkupScanDestination.resourceURI,
    );

    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async registerWalkupScanDestination(
    destination: Destination,
  ): Promise<string> {
    const xml = await destination.toXML();
    const url = "/WalkupScan/WalkupScanDestinations";
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async registerWalkupScanToCompDestination(
    destination: Destination,
  ): Promise<string> {
    const xml = await destination.toXML();
    const url = "/WalkupScanToComp/WalkupScanToCompDestinations";
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getEvents(
    etag = "",
    decisecondTimeout = 0,
  ): Promise<EtagEventTable> {
    const url = DeviceClient.appendTimeout("/EventMgmt/EventTable", decisecondTimeout);

    const headers = DeviceClient.placeETagHeader(etag, {});

    let response: AxiosResponse<string>;
    try {
      response = await this.callAxios({
        baseURL: `http://${this.deviceIP}`,
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

  async getDestination(
    destinationURL: string,
  ): Promise<WalkupScanDestination | WalkupScanToCompDestination> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getScanStatus(): Promise<ScanStatus> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getEsclScanStatus(): Promise<EsclScanStatus> {
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async isHpScanDevice(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await this.callAxios({
        baseURL: `http://${this.deviceIP}`,
        url: "/DevMgmt/DiscoveryTree.xml",
        method: "GET",
        responseType: "text",
        timeout: 1500,
        signal: controller.signal,
      });
      if (response.status !== 200) {
        return false;
      }
      const content = response.data;
      if (typeof content !== "string") {
        return false;
      }
      return DiscoveryTree.looksLikeHpScanDevice(content);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async delay(t: number): Promise<void> {
    return delay(t);
  }

  async postJob(job: IScanJobSettings): Promise<string> {
    await this.delay(500);
    const xml = await job.toXML();
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}:8080`,
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

  async postEsclJob(job: IScanJobSettings): Promise<string> {
    await this.delay(500);
    const xml = await job.toXML();
    const response = await this.callAxios({
      baseURL: `http://${this.deviceIP}`,
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

  async getJob(jobURL: string): Promise<Job> {
    const response = await this.callAxios({
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

  async downloadPage(
    binaryURL: string,
    destination: string,
    timeout?: number,
  ): Promise<string> {
    const response = await this.callAxios<Stream>({
      baseURL: `http://${this.deviceIP}:8080`,
      url: binaryURL,
      method: "GET",
      responseType: "stream",
      ...(timeout !== undefined && { timeout }),
    });

    const data = response.data;

    const destinationFileStream = fs.createWriteStream(destination);
    data.pipe(destinationFileStream);

    await promisify(stream.finished)(destinationFileStream);

    return destination;
  }

  async downloadPageWithMeta(
    binaryURL: string,
    destination: string,
    timeout?: number,
  ): Promise<{ path: string; contentType: string | undefined }> {
    const { data, headers }: AxiosResponse<Stream> =
      await axios.request<Stream>({
        baseURL: `http://${this.deviceIP}:8080`,
        url: binaryURL,
        method: "GET",
        responseType: "stream",
        ...(timeout !== undefined && { timeout }),
      });

    const destinationFileStream = fs.createWriteStream(destination);
    data.pipe(destinationFileStream);

    await promisify(stream.finished)(destinationFileStream);

    const contentType =
      typeof headers["content-type"] === "string"
        ? headers["content-type"]
        : undefined;

    return { path: destination, contentType };
  }

  async esclWaitDeviceBusy<T>(fn: () => Promise<T>): Promise<T> {
    let i = 0;
    do {
      i++;
      try {
        return await fn();
      } catch (error) {
        if (error instanceof AxiosError && error.status === 503) {
          console.log("Waiting, device is busy");
          await this.delay(1000);
          continue;
        }
        throw error;
      }
    } while (i < 30);
    throw new Error(`Failed, max retries reached: ${i}`);
  }

  async downloadEsclPage(
    jobUri: string,
    destination: string,
  ): Promise<{ path: string; contentType: string | undefined }> {
    return await this.esclWaitDeviceBusy(async () => {
      return await this.downloadPageWithMeta(
        jobUri + "/NextDocument",
        destination,
        60_000,
      );
    });
  }

  async getEsclScanImageInfo(
    jobUri: string,
  ): Promise<EsclScanImageInfo> {
    return await this.esclWaitDeviceBusy(async () => {
      const response = await this.callAxios({
        baseURL: `http://${this.deviceIP}`,
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
