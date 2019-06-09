"use strict";

export interface ScanStatusData {
  ScanStatus: {
    ScannerState: { "0": string };
    AdfState: { "0": string };
  };
}

export default class ScanStatus {
  private readonly data: ScanStatusData;
  constructor(data: ScanStatusData) {
    /**
     * @type {{ScannerState, AdfState} }
     */
    this.data = data;
  }

  get scannerState(): string {
    return this.data["ScanStatus"].ScannerState["0"];
  }

  get adfState(): string {
    return this.data["ScanStatus"].AdfState["0"];
  }

  isLoaded(): boolean {
    return this.adfState === "Loaded";
  }

  getInputSource(): string {
    return this.isLoaded() ? "Adf" : "Platen";
  }
}
