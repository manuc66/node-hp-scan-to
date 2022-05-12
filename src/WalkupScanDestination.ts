"use strict";

export interface WalkupScanDestinationData {
  "wus:WalkupScanDestinations": {
    "wus:WalkupScanDestination": {
      "dd:Name": string[];
      "dd3:Hostname": string[];
      "dd:ResourceURI": string[];
      "wus:WalkupScanSettings": {
        "scantype:ScanSettings": {
          "dd:ScanPlexMode": string[];
        }[];
        "wus:Shortcut": string[];
      }[];
    }[];
  };
}

export default class WalkupScanDestination {
  private readonly data: WalkupScanDestinationData;
  constructor(data: WalkupScanDestinationData) {
    this.data = data;
  }

  get name(): string {
    return this.data["wus:WalkupScanDestinations"][
      "wus:WalkupScanDestination"
    ][0]["dd:Name"][0];
  }

  get hostname(): string {
    return this.data["wus:WalkupScanDestinations"][
      "wus:WalkupScanDestination"
    ][0]["dd3:Hostname"][0];
  }

  get resourceURI(): string {
    return this.data["wus:WalkupScanDestinations"][
      "wus:WalkupScanDestination"
    ][0]["dd:ResourceURI"][0];
  }

  get shortcut(): string {
    return this.data["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"][
      "0"
    ]["wus:WalkupScanSettings"]["0"]["wus:Shortcut"][0];
  }

  getContentType(): "Document" | "Photo" {
    return this.shortcut === "SavePDF" ? "Document" : "Photo";
  }

  get scanPlexMode(): string | null {
    return this.data["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"][
      "0"
      ]["wus:WalkupScanSettings"]["0"]["scantype:ScanSettings"][0]["dd:ScanPlexMode"]?.[0];
  }
}
