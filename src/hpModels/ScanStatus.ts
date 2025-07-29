"use strict";
import { InputSource } from "../type/InputSource";
import { parseXmlString } from "./ParseXmlString";
import { IScanStatus } from "./IScanStatus";

export interface ScanStatusData {
  ScanStatus: {
    ScannerState: { "0": string };
    AdfState: { "0": string };
  };
}

export default class ScanStatus implements IScanStatus  {
  private readonly data: ScanStatusData;
  constructor(data: ScanStatusData) {
    this.data = data;
  }

  static async createScanStatus(content: string): Promise<ScanStatus> {
    const parsed = await parseXmlString<ScanStatusData>(content);
    return new ScanStatus(parsed);
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  get scannerState(): string | "Idle" {
    return this.data["ScanStatus"].ScannerState["0"];
  }

  get adfState(): string {
    if (
      Object.prototype.hasOwnProperty.call(this.data["ScanStatus"], "AdfState")
    ) {
      //not all printers have an automatic document feeder
      return this.data["ScanStatus"].AdfState["0"];
    } else {
      return "";
    }
  }

  isLoaded(): boolean {
    return this.adfState === "Loaded";
  }

  getInputSource(): InputSource {
    return this.isLoaded() ? InputSource.Adf : InputSource.Platen;
  }
}
