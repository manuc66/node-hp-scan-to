"use strict";
import { InputSource } from "../type/InputSource.js";
import { parseXmlString } from "./ParseXmlString.js";
import { IScanStatus } from "./IScanStatus.js";
import { AdfState } from "./AdfState.js";
import { ScannerState } from "./ScannerState.js";
import { EnumUtils } from "./EnumUtils.js";

export interface ScanStatusData {
  ScanStatus: {
    ScannerState: { "0": string };
    AdfState: { "0": string };
  };
}

export default class ScanStatus implements IScanStatus {
  private readonly data: ScanStatusData;
  constructor(data: ScanStatusData) {
    this.data = data;
  }

  static async createScanStatus(content: string): Promise<ScanStatus> {
    const parsed = await parseXmlString<ScanStatusData>(content);
    return new ScanStatus(parsed);
  }

  get scannerState(): ScannerState {
    return EnumUtils.getState(
      "ScannerState",
      ScannerState,
      this.data["ScanStatus"].ScannerState["0"],
    );
  }

  get adfState(): AdfState {
    if (
      Object.prototype.hasOwnProperty.call(this.data["ScanStatus"], "AdfState")
    ) {
      return EnumUtils.getState(
        "AdfState",
        AdfState,
        this.data["ScanStatus"].AdfState["0"],
      );
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
