"use strict";

export interface EventData {
  "dd:UnqualifiedEventCategory": string[];
  "dd:AgingStamp": string[];
  "ev:Payload": {
    "dd:ResourceURI": {
      "0": string;
    };
    "dd:ResourceType": {
      "0": string;
    };
  }[];
}

export interface IEvent {
  readonly unqualifiedEventCategory: string;
  readonly agingStamp: string;
  readonly destinationURI: string | undefined;
  readonly compEventURI: string | undefined;
  readonly isScanEvent: boolean;
}

export default class Event implements IEvent {
  private readonly data: EventData;
  constructor(data: EventData) {
    this.data = data;
  }

  get unqualifiedEventCategory(): string {
    return this.data["dd:UnqualifiedEventCategory"][0];
  }

  get agingStamp(): string {
    return this.data["dd:AgingStamp"][0];
  }

  get destinationURI(): string | undefined {
    if (Object.prototype.hasOwnProperty.call(this.data, "ev:Payload")) {
      const destination = this.data["ev:Payload"].find((v) =>
        v["dd:ResourceType"]["0"].includes("Destination")
      );

      return destination ? destination["dd:ResourceURI"]["0"] : undefined;
    }
    return undefined;
  }

  get compEventURI(): string | undefined {
    if (Object.prototype.hasOwnProperty.call(this.data, "ev:Payload")) {
      const compEvent = this.data["ev:Payload"].find((v) =>
        v["dd:ResourceType"]["0"].includes("CompEvent")
      );

      return compEvent ? compEvent["dd:ResourceURI"]["0"] : undefined;
    }
    return undefined;
  }

  get isScanEvent(): boolean {
    return this.unqualifiedEventCategory === "ScanEvent";
  }
}
