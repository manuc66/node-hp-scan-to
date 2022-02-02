"use strict";

export type EventData = {
  "dd:UnqualifiedEventCategory": string[];
  "ev:Payload": {
    "dd:ResourceURI": {
      "0": string;
    },
    "dd:ResourceType": {
      "0": string;
    };
  }[];
};

export default class Event {
  private readonly data: EventData;
  constructor(data: EventData) {
    this.data = data;
  }

  get unqualifiedEventCategory(): string {
    return this.data["dd:UnqualifiedEventCategory"][0];
  }

  get destinationURI(): string | undefined {
    const destination = this.data["ev:Payload"].find(v => v["dd:ResourceType"]["0"].includes("Destination"));

    return destination ? destination["dd:ResourceURI"]["0"] : undefined;
  }

  get compEventURI(): string | undefined {
    const compEvent = this.data["ev:Payload"].find(v => v["dd:ResourceType"]["0"].includes("CompEvent"));

    return compEvent ? compEvent["dd:ResourceURI"]["0"] : undefined;
  }

  get isScanEvent(): boolean {
    return this.unqualifiedEventCategory === "ScanEvent";
  }
}
