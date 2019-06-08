"use strict";

export type EventData = {
  "dd:UnqualifiedEventCategory": string[];
  "ev:Payload": {
    "0": {
      "dd:ResourceURI": {
        "0": string
      };
    }
  };
};

export default class Event {
  private readonly data: EventData;
  constructor(data: EventData) {
    this.data = data;
  }

  get unqualifiedEventCategory(): string {
    return this.data["dd:UnqualifiedEventCategory"][0];
  }

  get resourceURI(): string {
    return this.data["ev:Payload"]["0"]["dd:ResourceURI"]["0"];
  }

  get isScanEvent(): boolean {
    return this.unqualifiedEventCategory === "ScanEvent";
  }
}
