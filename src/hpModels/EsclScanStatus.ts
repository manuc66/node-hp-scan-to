"use strict";
import { InputSource } from "../type/InputSource";
import { parseXmlString } from "./ParseXmlString";
import { IScanStatus } from "./IScanStatus";
import { ScannerState } from "./ScannerState";
import { AdfState } from "./AdfState";
import { EnumUtils } from "./EnumUtils";

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

  get scannerState(): ScannerState {
    const scannerStateStr = this.data["scan:ScannerStatus"]["pwg:State"]["0"];
    return EnumUtils.getState("ScannerState", ScannerState, scannerStateStr);
  }

  get adfState(): AdfState {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerStatus"],
        "scan:AdfState",
      )
    ) {
      //not all printers have an automatic document feeder
      const adfState = this.data["scan:ScannerStatus"]["scan:AdfState"]["0"];

      // map value to the one of ScanStatus for commodity
      if (adfState === "ScannerAdfEmpty") {
        return AdfState.Empty;
      } else if (adfState === "ScannerAdfLoaded") {
        return AdfState.Loaded;
      } else {
        console.error(
          `"${adfState}" is not a know AdfState value, you would be kind as a reader of this message to fill an issue to help at better state handling.`,
        );
      }
      return adfState as AdfState;
    } else {
      return AdfState.Empty;
    }
  }

  isLoaded(): boolean {
    return this.adfState === AdfState.Loaded;
  }

  getInputSource(): InputSource {
    return this.isLoaded() ? InputSource.Adf : InputSource.Platen;
  }
}
