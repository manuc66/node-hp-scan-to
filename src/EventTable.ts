"use strict";

import Event, { EventData } from "./Event";
import { EtagEventTable } from "./HPApi";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, any>(parser.parseString);

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
    etagReceived: string
  ): Promise<EtagEventTable> {
    const parsed = await parseString(content);
    return {
      etag: etagReceived,
      eventTable: new EventTable(parsed as EventTableData),
    };
  }


  get events() {
    let eventTable = this.data["ev:EventTable"];
    if (eventTable != null && eventTable["ev:Event"] != null) {
      return eventTable["ev:Event"].map((x) => new Event(x));
    } else {
      return [];
    }
  }
}
