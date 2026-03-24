import type { ScanFormat } from "../type/scanFormat.js";
import type { ScanMode } from "../type/scanMode.js";

export interface IScanJobSettings {
  toXML(): Promise<string>;
  get xResolution(): number;
  get yResolution(): number;
  get format(): ScanFormat;
  get mode(): ScanMode;
}
