"use strict";

import { parseXmlString } from "./ParseXmlString.js";

export interface EsclScanImageInfoData {
  "scan:ScanImageInfo": {
    "pwg:JobUri": string[];
    "pwg:JobUuid": string[];
    "scan:ActualWidth": string[];
    "scan:ActualHeight": string[];
  };
}

export default class EsclScanImageInfo {
  private readonly data: EsclScanImageInfoData;

  constructor(data: EsclScanImageInfoData) {
    this.data = data;
  }

  static async createScanImageInfo(content: string) {
    const parsed = await parseXmlString<EsclScanImageInfoData>(content);
    return new EsclScanImageInfo(parsed);
  }

  get actualWidth(): number {
    return parseInt(this.data["scan:ScanImageInfo"]["scan:ActualWidth"][0], 10);
  }

  get actualHeight(): number {
    return parseInt(
      this.data["scan:ScanImageInfo"]["scan:ActualHeight"][0],
      10,
    );
  }
  get jobURI(): string {
    return this.data["scan:ScanImageInfo"]["pwg:JobUri"][0];
  }
  get jobUuid(): string {
    return this.data["scan:ScanImageInfo"]["pwg:JobUuid"][0];
  }
}
