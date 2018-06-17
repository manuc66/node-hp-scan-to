"use strict";

module.exports = class ScanStatus {
  constructor(data) {
    /**
     * @type {{ScannerState, AdfState} }
     */
    this.data = data;
  }

  get scannerState() {
    return this.data["ScanStatus"].ScannerState["0"];
  }

  get adfState() {
    return this.data["ScanStatus"].AdfState["0"];
  }

  isLoaded() {
    return this.adfState === "Loaded";
  }

  getInputSource() {
    return this.isLoaded() ? "Adf" : "Platen";
  }
};
