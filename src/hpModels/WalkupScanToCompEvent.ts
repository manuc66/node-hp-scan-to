"use strict";

import { parseXmlString } from "./ParseXmlString";

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
    const parsed = await parseXmlString<WalkupScanToCompEventData>(content);
    return new WalkupScanToCompEvent(parsed);
  }

  get eventType(): string {
    return this.data["wus:WalkupScanToCompEvent"][
      "wus:WalkupScanToCompEventType"
    ][0];
  }
}
