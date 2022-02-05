"use strict";

export interface WalkupScanToCompEventData {
  "wus:WalkupScanToCompEvent": {
    'wus:WalkupScanToCompEventType': string[]
  }
}

export default class WalkupScanToCompEvent {
  private readonly data: WalkupScanToCompEventData;
  constructor(data: WalkupScanToCompEventData) {
    this.data = data;
  }

  get eventType(): string {
    return this.data["wus:WalkupScanToCompEvent"]["wus:WalkupScanToCompEventType"][0];
  }
}
