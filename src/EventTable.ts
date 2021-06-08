"use strict";

import Event, { EventData } from "./Event";

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

  get events() {
    let eventTable = this.data["ev:EventTable"];
    if (eventTable != null && eventTable["ev:Event"] != null) {
      return eventTable["ev:Event"].map((x) => new Event(x));
    } else {
      return [];
    }
  }
}
