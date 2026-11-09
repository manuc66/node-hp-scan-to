"use strict";

import { promisify } from "node:util";
import fs from "node:fs";
import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type RawAxiosRequestHeaders,
} from "axios";
import * as stream from "node:stream";
import type Stream from "node:stream";
import type { Agent } from "node:https";
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
import EsclWalkupEvent from "./hpModels/EsclWalkupEvent.js";
import EsclWalkupSubscription from "./hpModels/EsclWalkupSubscription.js";
import PathHelper from "./PathHelper.js";
import { getLoggerForFile } from "./logger.js";
import {
  CertificatePinError,
  createPrinterHttpsAgent,
  readConfiguredFingerprint,
} from "./PrinterHttpsAgent.js";

const logger = getLoggerForFile(import.meta.url);

export interface DeviceClientOptions {
  /** SHA-256 fingerprint of the printer's eSCL HTTPS certificate. */
  esclCertificateFingerprint?: string;
}

export default class DeviceClient {
  readonly deviceIP: string;
  readonly debug: boolean;
  private callCount = 0;
  private esclBaseUrlPromise: Promise<string | null> | null = null;
  private httpsAgentPromise: Promise<Agent> | null = null;
  private readonly esclCertificateFingerprint: string | undefined;

  constructor(
    deviceIP: string,
    debug = false,
    options: DeviceClientOptions = {},
  ) {
    this.deviceIP = deviceIP;
    this.debug = debug;
    this.esclCertificateFingerprint =
      options.esclCertificateFingerprint ?? readConfiguredFingerprint();
  }

  private async getHttpsAgent(): Promise<Agent> {
    this.httpsAgentPromise ??= createPrinterHttpsAgent(
      this.deviceIP,
      this.esclCertificateFingerprint,
    );
    return await this.httpsAgentPromise;
  }

  private static isHttpsRequest(request: AxiosRequestConfig): boolean {
    return (
      (request.baseURL ?? "").startsWith("https:") ||
      (request.url ?? "").startsWith("https:")
    );
  }

  isDebug(): boolean {
    return this.debug;
  }

  private logDebug(
    callId: number,
    isRequest: boolean,
    msg: object | string,
  ): void {
    const id = String(callId).padStart(4, "0");
    const prefix = id + (isRequest ? " -> " : " <- ");
    // Do not store the detail under `msg`: pino overwrites `msg` with the
    // message string, so the request/response detail would be lost.
    const detailKey = isRequest ? "request" : "response";
    logger.debug({ callId, isRequest, [detailKey]: msg }, prefix);
  }

  private async callAxios<T = string>(
    request: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    this.callCount++;

    const effectiveRequest: AxiosRequestConfig = { ...request };
    if (
      effectiveRequest.httpsAgent === undefined &&
      DeviceClient.isHttpsRequest(effectiveRequest)
    ) {
      effectiveRequest.httpsAgent = await this.getHttpsAgent();
    }
    if (effectiveRequest.timeout === 0) {
      effectiveRequest.timeout = 100_000;
    }
    const debugRequest: Record<string, unknown> = { ...effectiveRequest };
    if (debugRequest["httpsAgent"] !== undefined) {
      debugRequest["httpsAgent"] = "[printer https agent]";
    }
    this.logDebug(this.callCount, true, debugRequest);
    try {
      const response = await axios({
        ...effectiveRequest,
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

  private static isHttpStatus(error: unknown, statuses: number[]): boolean {
    if (!(error instanceof AxiosError)) {
      return false;
    }
    const status = error.response?.status ?? error.status;
    return status !== undefined && statuses.includes(status);
  }

  static isSubscriptionExpired(error: unknown): boolean {
    return DeviceClient.isHttpStatus(error, [404, 410]);
  }

  private rememberEsclBaseUrlFrom(uri: string): void {
    if (this.esclBaseUrlPromise !== null || !/^https?:\/\//.test(uri)) {
      return;
    }

    const url = new URL(uri);
    this.esclBaseUrlPromise = Promise.resolve(`${url.protocol}//${url.host}`);
  }

  private async getEsclBaseUrlForJob(jobUri: string): Promise<string> {
    this.rememberEsclBaseUrlFrom(jobUri);
    if (this.esclBaseUrlPromise !== null) {
      return await this.getEsclBaseUrl();
    }

    // A relative job URI carries no scheme. Keep the historical HTTP
    // fallback unless a base was already resolved when the job was created.
    return `http://${this.deviceIP}`;
  }

  /**
   * Resolve the base URL used by the standard eSCL endpoints.
   *
   * Older firmware serves eSCL over plain HTTP on port 80; newer devices only
   * expose it over HTTPS on port 443. The result is cached so probing happens
   * at most once per client; a failed probe is retried on the next call.
   */
  async getEsclBaseUrl(): Promise<string> {
    this.esclBaseUrlPromise ??= this.detectEsclBaseUrl();
    const detected = await this.esclBaseUrlPromise;
    if (detected !== null) {
      return detected;
    }

    this.esclBaseUrlPromise = null;
    logger.debug(
      `No eSCL HTTPS endpoint detected; falling back to http://${this.deviceIP}`,
    );
    return `http://${this.deviceIP}`;
  }

  private async detectEsclBaseUrl(): Promise<string | null> {
    const candidates = [`http://${this.deviceIP}`, `https://${this.deviceIP}`];

    for (const baseURL of candidates) {
      try {
        const response = await this.callAxios({
          baseURL,
          url: "/eSCL/ScannerStatus",
          method: "GET",
          responseType: "text",
          timeout: 3000,
        });
        if (response.status === 200) {
          logger.info(`Using eSCL base URL: ${baseURL}`);
          return baseURL;
        }
        logger.debug(
          { baseURL, status: response.status },
          "eSCL base URL probe did not succeed",
        );
      } catch (error) {
        logger.debug({ baseURL, err: error }, "eSCL base URL probe failed");
      }
    }

    return null;
  }

  private async isPortOpen(port: number, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection(port, this.deviceIP, () => {
        clearTimeout(timer);
        resolve(true);
        socket.end();
      });
      const timer = setTimeout(() => {
        resolve(false);
        socket.end();
      }, timeout);
      socket.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  async isAlive(timeout: number | null = null): Promise<boolean> {
    const definedTimeout = timeout ?? 10000;
    // Some eSCL-only firmware only listens on HTTPS 443, while older devices
    // only use HTTP 80. Probe both in parallel and resolve as soon as one
    // answers, so an open device is not delayed by the other port.
    return new Promise((resolve) => {
      let pending = 2;
      const finish = (alive: boolean): void => {
        if (alive || --pending === 0) {
          resolve(alive);
        }
      };

      void this.isPortOpen(80, definedTimeout).then(finish);
      void this.isPortOpen(443, definedTimeout).then(finish);
    });
  }

  async waitDeviceUp(deviceUpPollingInterval: number): Promise<void> {
    let first = true;
    while (!(await this.isAlive())) {
      if (first) {
        logger.info(
          `Device ip: ${this.deviceIP} is down! [${new Date().toISOString()}]`,
        );
      }
      first = false;
      await delay(deviceUpPollingInterval);
    }
    if (!first) {
      logger.info(
        `Device ip: ${this.deviceIP} is up again! [${new Date().toISOString()}]`,
      );
    }
  }

  async getDiscoveryTree(): Promise<DiscoveryTree> {
    let lastError: unknown;
    let sawMissingTree = false;

    // Newer firmware only exposes HTTPS 443, while older devices keep the
    // LEDM document on plain HTTP. Try both before deciding that the tree is
    // absent.
    for (const baseURL of [
      `http://${this.deviceIP}`,
      `https://${this.deviceIP}`,
    ]) {
      let response: AxiosResponse<string>;
      try {
        response = await this.callAxios({
          baseURL,
          url: "/DevMgmt/DiscoveryTree.xml",
          method: "GET",
          responseType: "text",
          // Do not throw on 404: we handle a missing tree explicitly below.
          validateStatus: () => true,
        });
      } catch (error) {
        if (error instanceof CertificatePinError) {
          throw error;
        }
        lastError = error;
        continue;
      }

      if (response.status === 200) {
        return DiscoveryTree.createDiscoveryTree(response.data);
      }

      if (response.status === 404 || response.status === 405) {
        sawMissingTree = true;
        continue;
      }

      throw new Error(
        `DiscoveryTree.xml request failed with status ${response.status}`,
      );
    }

    if (lastError !== undefined && !sawMissingTree) {
      if (lastError instanceof Error) {
        throw lastError;
      }
      throw new Error("DiscoveryTree.xml request failed");
    }

    logger.warn(
      `DiscoveryTree.xml not available; falling back to standard eSCL endpoints.`,
    );
    return DiscoveryTree.empty();
  }

  /**
   * Standard eSCL capabilities path. Some devices serve
   * /eSCL/ScanCapabilities, others (HP firmware) only /eSCL/ScannerCapabilities.
   */
  async getEsclScanCapsFromWellKnownPath(): Promise<EsclScanCaps | null> {
    for (const path of [
      "/eSCL/ScanCapabilities",
      "/eSCL/ScannerCapabilities",
    ]) {
      try {
        const response = await this.callAxios({
          baseURL: await this.getEsclBaseUrl(),
          url: path,
          method: "GET",
          responseType: "text",
          // A 404 on the first candidate is expected; probe the next one.
          validateStatus: () => true,
        });
        if (response.status === 200) {
          return await EsclScanCaps.createScanCaps(response.data);
        }
      } catch (error) {
        if (error instanceof CertificatePinError) {
          throw error;
        }
        logger.debug({ error }, `eSCL capabilities probe for ${path} failed`);
      }
    }
    return null;
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

  async getEsclScanJobManifest(uri: string): Promise<EsclScanJobManifest> {
    this.rememberEsclBaseUrlFrom(uri);
    const response = await this.callAxios({
      baseURL: await this.getEsclBaseUrl(),
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
    this.rememberEsclBaseUrlFrom(uri);
    const response = await this.callAxios({
      baseURL: await this.getEsclBaseUrl(),
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

  async getWalkupScanToCompCaps(uri: string): Promise<WalkupScanToCompCaps> {
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

  async getEvents(etag = "", decisecondTimeout = 0): Promise<EtagEventTable> {
    const url = DeviceClient.appendTimeout(
      "/EventMgmt/EventTable",
      decisecondTimeout,
    );

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
      url += `?timeout=${timeout}`;
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

  async getEsclScanStatus(jobUri?: string): Promise<EsclScanStatus> {
    const baseURL =
      jobUri === undefined
        ? await this.getEsclBaseUrl()
        : await this.getEsclBaseUrlForJob(jobUri);

    const response = await this.callAxios({
      baseURL,
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
      timeout: 30_000,
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
      baseURL: await this.getEsclBaseUrl(),
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
   * Some devices expose eSCL scanning but not the walkup subscription
   * extension. A GET on the collection is the least invasive way to tell
   * them apart before registering anything.
   */
  async supportsEsclWalkup(): Promise<boolean> {
    try {
      const response = await this.callAxios({
        baseURL: await this.getEsclBaseUrl(),
        url: "/eSCL/WalkupSubscriptions",
        method: "GET",
        responseType: "text",
        validateStatus: () => true,
      });
      return response.status === 200 || response.status === 405;
    } catch (error) {
      if (error instanceof CertificatePinError) {
        throw error;
      }
      logger.debug(`Could not probe eSCL walkup support: ${String(error)}`);
      return false;
    }
  }

  async registerEsclWalkupSubscription(
    hostIdentifier: string,
    shortcuts: string[],
  ): Promise<string> {
    const subscription = new EsclWalkupSubscription(hostIdentifier, shortcuts);
    const url = "/eSCL/WalkupSubscriptions";
    const response = await this.callAxios({
      baseURL: await this.getEsclBaseUrl(),
      url,
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "Cache-Control": "no-cache",
      },
      data: subscription.toXML(),
      responseType: "text",
    });

    const location: unknown = response.headers["location"];
    if (response.status !== 201 || typeof location !== "string") {
      throw new Error(
        `Unexpected status code or location when registering to ${url}: ${response.status} - ${String(location)}`,
      );
    }

    return PathHelper.getPathFromHttpLocation(location);
  }

  async getEsclWalkupEvent(
    subscriptionURI: string,
    timeoutSeconds = 100,
  ): Promise<EsclWalkupEvent | null> {
    const url = DeviceClient.appendTimeout(
      `${subscriptionURI}/Event`,
      timeoutSeconds,
    );
    const response = await this.callAxios({
      baseURL: await this.getEsclBaseUrl(),
      url,
      method: "GET",
      responseType: "text",
      timeout: (timeoutSeconds + 10) * 1000,
    });

    if (response.status === 204) {
      return null;
    }

    if (response.status !== 200) {
      throw new Error(
        `Unexpected status code when getting ${subscriptionURI}: ${response.status}`,
      );
    }

    return await EsclWalkupEvent.create(response.data);
  }

  async removeEsclWalkupSubscription(subscriptionURI: string): Promise<void> {
    const response = await this.callAxios({
      baseURL: await this.getEsclBaseUrl(),
      url: subscriptionURI,
      method: "DELETE",
      responseType: "text",
    });

    if (response.status !== 200 && response.status !== 204) {
      throw new Error(
        `Unexpected status code when removing ${subscriptionURI}: ${response.status}`,
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
    timeout = 60_000,
  ): Promise<string> {
    const response = await this.callAxios<Stream>({
      baseURL: `http://${this.deviceIP}:8080`,
      url: binaryURL,
      method: "GET",
      responseType: "stream",
      timeout,
    });

    const data = response.data;

    // NOSONAR: destination is generated under the configured output directory, not user input.
    const destinationFileStream = fs.createWriteStream(destination);
    data.pipe(destinationFileStream);

    await promisify(stream.finished)(destinationFileStream);

    return destination;
  }

  private async downloadPageWithMetaFrom(
    baseURL: string,
    binaryURL: string,
    destination: string,
    timeout = 60_000,
  ): Promise<{ path: string; contentType: string | undefined }> {
    const httpsAgent = baseURL.startsWith("https:")
      ? await this.getHttpsAgent()
      : undefined;
    const requestUrl = binaryURL.startsWith("http")
      ? binaryURL
      : `${baseURL}${binaryURL}`;
    logger.debug({ url: requestUrl, destination }, "Downloading scan page");
    try {
      const { data, headers, status }: AxiosResponse<Stream> =
        await axios.request<Stream>({
          baseURL,
          url: binaryURL,
          method: "GET",
          responseType: "stream",
          ...(httpsAgent !== undefined && { httpsAgent }),
          ...(timeout !== undefined && { timeout }),
        });
      logger.debug({ url: requestUrl, status, headers }, "Scan page response");

      const destinationFileStream = fs.createWriteStream(destination);
      data.pipe(destinationFileStream);

      await promisify(stream.finished)(destinationFileStream);

      const contentType =
        typeof headers["content-type"] === "string"
          ? headers["content-type"]
          : undefined;

      return { path: destination, contentType };
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.debug(
        {
          url: requestUrl,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          headers: axiosError.response?.headers,
        },
        "Scan page download failed",
      );
      throw error;
    }
  }

  async downloadPageWithMeta(
    binaryURL: string,
    destination: string,
    timeout?: number,
    port = 8080,
  ): Promise<{ path: string; contentType: string | undefined }> {
    return await this.downloadPageWithMetaFrom(
      `http://${this.deviceIP}:${port}`,
      binaryURL,
      destination,
      timeout,
    );
  }

  async esclWaitDeviceBusy<T>(fn: () => Promise<T>): Promise<T> {
    let i = 0;
    do {
      i++;
      try {
        return await fn();
      } catch (error) {
        if (error instanceof AxiosError && error.status === 503) {
          logger.info("Waiting, device is busy");
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
    const baseURL = await this.getEsclBaseUrlForJob(jobUri);
    return await this.esclWaitDeviceBusy(async () => {
      return await this.downloadEsclPageWithMeta(
        `${jobUri}/NextDocument`,
        destination,
        60_000,
        baseURL,
      );
    });
  }

  /**
   * eSCL is not served on the HP-proprietary port 8080: older devices use
   * port 80, newer firmware only exposes HTTPS 443.
   */
  async downloadEsclPageWithMeta(
    url: string,
    destination: string,
    timeout?: number,
    baseURL?: string,
  ): Promise<{ path: string; contentType: string | undefined }> {
    return await this.downloadPageWithMetaFrom(
      baseURL ?? (await this.getEsclBaseUrl()),
      url,
      destination,
      timeout,
    );
  }

  async getEsclScanImageInfo(jobUri: string): Promise<EsclScanImageInfo> {
    const baseURL = await this.getEsclBaseUrlForJob(jobUri);
    return await this.esclWaitDeviceBusy(async () => {
      const response = await this.callAxios({
        baseURL,
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
    });
  }
}
