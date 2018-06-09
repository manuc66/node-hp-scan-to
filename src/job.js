"use strict";

module.exports = class Job {
    constructor(data) {
        this.data = data;
    }

    get pageNumber() {
        return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].PageNumber["0"];
    }

    get jobState() {
        return this.data["j:Job"]["j:JobState"][0];
    }

    get pageState() {
        return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].PageState["0"];
    }

    get binaryURL() {
        return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].BinaryURL["0"];
    }
};