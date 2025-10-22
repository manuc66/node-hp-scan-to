"use strict";

import Event, { EventData } from "./Event.js";
import { parseXmlString } from "./ParseXmlString.js";

export interface EtagEventTable {
  etag: string;
  eventTable: EventTable;
}

export interface EventTableData {
  "ev:EventTable"?: {
    "ev:Event"?: EventData[];
  };
}

export default class EventTable {
  private readonly data: EventTableData;
  constructor(data: EventTableData) {
    this.data = data;
  }

  static async createEtagEventTable(
    content: string,
    etagReceived: string,
  ): Promise<EtagEventTable> {
    const parsed = await parseXmlString<EventTableData>(content);
    return {
      etag: etagReceived,
      eventTable: new EventTable(parsed),
    };
  }

  get events(): Event[] {
    const eventTable = this.data["ev:EventTable"];
    if (eventTable != null && eventTable["ev:Event"] != null) {
      return eventTable["ev:Event"].map((x) => new Event(x));
    } else {
      return [];
    }
  }
}
