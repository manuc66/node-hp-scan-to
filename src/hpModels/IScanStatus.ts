import { InputSource } from "../type/InputSource.js";
import { ScannerState } from "./ScannerState.js";
import { AdfState } from "./AdfState.js";

export interface IScanStatus {
  readonly scannerState: ScannerState;
  readonly adfState: AdfState;

  isLoaded(): boolean;

  getInputSource(): InputSource;
}
