export interface DeviceCapabilities {
  supportsMultiItemScanFromPlaten: boolean;
  useWalkupScanToComp: boolean;
  platenMaxWidth: number | null;
  platenMaxHeight: number | null;
  adfMaxWidth: number | null;
  adfMaxHeight: number | null;
}
