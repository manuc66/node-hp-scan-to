"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, any>(parser.parseString);

export interface ScanStatusData {
  ScanStatus: {
    ScannerState: { "0": string };
    AdfState: { "0": string };
  };
}

export default class ScanStatus {
  private readonly data: ScanStatusData;
  constructor(data: ScanStatusData) {
    this.data = data;
  }

  static async createScanStatus(content: string): Promise<ScanStatus> {
    const parsed = (await parseString(content)) as ScanStatusData;
    return new ScanStatus(parsed);
  }

  get scannerState(): string {
    return this.data["ScanStatus"].ScannerState["0"];
  }

  get adfState(): string {
    if (this.data["ScanStatus"].hasOwnProperty("AdfState")) {
      //not all printers have an automatic document feeder
      return this.data["ScanStatus"].AdfState["0"];
    } else {
      return "";
    }
  }

  isLoaded(): boolean {
    return this.adfState === "Loaded";
  }

  getInputSource(): "Adf" | "Platen" {
    return this.isLoaded() ? "Adf" : "Platen";
  }
}
