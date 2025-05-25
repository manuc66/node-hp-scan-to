import Event from "../hpModels/Event";

export type RegistrationConfig = {
  label: string;
  isDuplexSingleSide: boolean;
};

export type ScanTarget = RegistrationConfig & {
  resourceURI: string;
};
export type SelectedScanTarget = ScanTarget & {
  event: Event;
};
