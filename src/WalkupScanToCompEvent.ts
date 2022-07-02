"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, WalkupScanToCompEventData>(
  parser.parseString
);

export interface WalkupScanToCompEventData {
  "wus:WalkupScanToCompEvent": {
    "wus:WalkupScanToCompEventType": string[];
  };
}

export default class WalkupScanToCompEvent {
  private readonly data: WalkupScanToCompEventData;
  constructor(data: WalkupScanToCompEventData) {
    this.data = data;
  }
  static async createWalkupScanToCompEvent(content: string) {
    const parsed = await parseString(content);
    return new WalkupScanToCompEvent(parsed);
  }

  get eventType(): string {
    return this.data["wus:WalkupScanToCompEvent"][
      "wus:WalkupScanToCompEventType"
    ][0];
  }
}
