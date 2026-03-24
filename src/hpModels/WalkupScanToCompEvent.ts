"use strict";

import { parseXmlString } from "./ParseXmlString.js";
import { EnumUtils } from "./EnumUtils.js";

export interface WalkupScanToCompEventData {
  "wus:WalkupScanToCompEvent": {
    "wus:WalkupScanToCompEventType": string[];
  };
}

export enum EventType {
  HostSelected = "HostSelected",
  ScanRequested = "ScanRequested",
  ScanNewPageRequested = "ScanNewPageRequested",
  ScanPagesComplete = "ScanPagesComplete",
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

  get eventType(): EventType {
    const eventTypeStr =
      this.data["wus:WalkupScanToCompEvent"][
        "wus:WalkupScanToCompEventType"
      ][0];
    return EnumUtils.getState("EventType", EventType, eventTypeStr);
  }
}
