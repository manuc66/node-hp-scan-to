"use strict";

module.exports = class ScanStatus {
    constructor(data) {
        this.data = data;
    }

    get scannerState() {
        return this.data["ScanStatus"].ScannerState["0"];
    }

    get adfState() {
        return this.data["ScanStatus"].AdfState["0"];
    }
};