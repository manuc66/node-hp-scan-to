import type { InputSource } from "../type/InputSource.js";
import type { ScannerState } from "./ScannerState.js";
import type { AdfState } from "./AdfState.js";

export interface IScanStatus {
  readonly scannerState: ScannerState;
  readonly adfState: AdfState;

  isLoaded(): boolean;

  getInputSource(): InputSource;
}
