import { InputSource } from "../type/InputSource";

export interface IScanStatus {
  readonly scannerState: string;
  readonly adfState: string;

  isLoaded(): boolean;

  getInputSource(): InputSource;
}