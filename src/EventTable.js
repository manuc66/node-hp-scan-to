"use strict";

const Event = require("./Event");

module.exports = class EventTable {

    constructor(data) {
        this.data = data;
    }

    /**
     *
     * @returns {Event[]}
     */
    get events() {
        let eventTable = this.data["ev:EventTable"];
        if (eventTable != null && eventTable.hasOwnProperty("ev:Event")) {
            return eventTable["ev:Event"].map(x => new Event(x));
        }
        else {
            return [];
        }

    }
};