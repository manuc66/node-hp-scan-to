"use strict";

import Event, { type EventData, type IEvent } from "./Event.js";
import { parseXmlString } from "./ParseXmlString.js";

export interface EtagEventTable {
  etag: string;
  eventTable: IEventTable;
}

export interface EventTableData {
  "ev:EventTable"?: {
    "ev:Event"?: EventData[];
  };
}

interface IEventTable {
  readonly events: IEvent[];
}

export default class EventTable implements IEventTable {
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
    if (eventTable?.["ev:Event"] !== undefined) {
      return eventTable["ev:Event"].map((x) => new Event(x));
    } else {
      return [];
    }
  }
}
