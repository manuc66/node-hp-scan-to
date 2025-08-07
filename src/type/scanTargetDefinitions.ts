import Event from "../hpModels/Event";
import { DuplexAssemblyMode } from "./DuplexAssemblyMode";

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
