"use strict";

module.exports = class Event {
    constructor(data) {
        this.data = data;
    }

    /**
     *
     * @returns {String}
     */
    get unqualifiedEventCategory() {
        return this.data["dd:UnqualifiedEventCategory"][0];
    }

    get resourceURI() {
        return this.data["ev:Payload"]["0"]["dd:ResourceURI"]["0"];
    }

    get agingStamp() {
        return this.data["dd:AgingStamp"]["0"];
    }

    /**
     *
     * @returns {boolean}
     */
    get isScanEvent() {
        return this.unqualifiedEventCategory === "ScanEvent";
    }
};