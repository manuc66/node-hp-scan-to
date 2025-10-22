import Event from "../hpModels/Event.js";
import { DuplexAssemblyMode } from "./DuplexAssemblyMode.js";

export type RegistrationConfig = {
  label: string;
  isDuplexSingleSide: boolean;
  duplexAssemblyMode?: DuplexAssemblyMode;
};

export type ScanTarget = RegistrationConfig & {
  resourceURI: string;
};
export type SelectedScanTarget = ScanTarget & {
  event: Event;
};
