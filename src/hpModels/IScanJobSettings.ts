export interface IScanJobSettings {
  toXML(): Promise<string>;
  get xResolution(): number;
  get yResolution(): number;
}
