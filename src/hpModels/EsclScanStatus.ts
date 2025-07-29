"use strict";
import { InputSource } from "../type/InputSource";
import { parseXmlString } from "./ParseXmlString";
import { IScanStatus } from "./IScanStatus";

export interface EsclScanStatusData {
  "scan:ScannerStatus": {
    "pwg:State": { "0": string };
    "scan:AdfState": { "0": string };
  };
}

export default class EsclScanStatus implements IScanStatus {
  private readonly data: EsclScanStatusData;
  constructor(data: EsclScanStatusData) {
    this.data = data;
  }

  static async createScanStatus(content: string): Promise<EsclScanStatus> {
    const parsed = await parseXmlString<EsclScanStatusData>(content);
    return new EsclScanStatus(parsed);
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  get scannerState(): string | "Idle" {
    return this.data["scan:ScannerStatus"]["pwg:State"]["0"];
  }

  get adfState(): string {
    if (
      Object.prototype.hasOwnProperty.call(this.data["scan:ScannerStatus"], "scan:AdfState")
    ) {
      //not all printers have an automatic document feeder
      const adfState = this.data["scan:ScannerStatus"]["scan:AdfState"]["0"];

      // map value to the one of ScanStatus for commodity
      if (adfState === "ScannerAdfEmpty") {
        return "Empty";
      } else if (adfState === "ScannerAdfLoaded") {
        return "Loaded";
      }
      return adfState;
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
