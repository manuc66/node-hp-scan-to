import { InputSource } from "../type/InputSource";
import { ScannerState } from "./ScannerState";
import { AdfState } from "./AdfState";

export interface IScanStatus {
  readonly scannerState: ScannerState;
  readonly adfState: AdfState;

  isLoaded(): boolean;

  getInputSource(): InputSource;
}
