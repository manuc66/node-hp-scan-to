import { ScanFormat } from "../type/scanFormat";
import { ScanMode } from "../type/scanMode";

export interface IScanJobSettings {
  toXML(): Promise<string>;
  get xResolution(): number;
  get yResolution(): number;
  get format(): ScanFormat;
  get mode(): ScanMode;
}
