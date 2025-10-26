import type Event from "../hpModels/Event.js";
import type { DuplexAssemblyMode } from "./DuplexAssemblyMode.js";

export interface RegistrationConfig {
  label: string;
  isDuplexSingleSide: boolean;
  duplexAssemblyMode?: DuplexAssemblyMode;
}

export type ScanTarget = RegistrationConfig & {
  resourceURI: string;
};
export type SelectedScanTarget = ScanTarget & {
  event: Event;
};
