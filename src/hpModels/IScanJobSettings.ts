import type { ScanMode } from "../type/scanMode.js";
import type { ImageFormat } from "../imageFormats/index.js";

export interface IScanJobSettings {
  toXML(): Promise<string>;
  get xResolution(): number;
  get yResolution(): number;
  get format(): ImageFormat;
  get mode(): ScanMode;
}
