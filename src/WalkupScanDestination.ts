"use strict";

export interface WalkupScanDestinationData {
  "dd:Name": string[];
  "dd3:Hostname": string[];
  "dd:ResourceURI": string[];
  "wus:WalkupScanSettings": {
    "scantype:ScanSettings": {
      "dd:ScanPlexMode": string[];
    }[];
    "wus:Shortcut": string[];
  }[];
}

export default class WalkupScanDestination {
  private readonly data: WalkupScanDestinationData;
  constructor(data: WalkupScanDestinationData) {
    this.data = data;
  }

  get name(): string {
    return this.data["dd:Name"][0];
  }

  get hostname(): string {
    return this.data["dd3:Hostname"][0];
  }

  get resourceURI(): string {
    return this.data["dd:ResourceURI"][0];
  }

  get shortcut(): string | null {
    if (this.data.hasOwnProperty("wus:WalkupScanSettings")) {
      return this.data["wus:WalkupScanSettings"]["0"]["wus:Shortcut"][0];
    }
    return null;
  }

  getContentType(): "Document" | "Photo" {
    return this.shortcut === "SavePDF" ? "Document" : "Photo";
  }

  get scanPlexMode(): string | null {
    if (this.data.hasOwnProperty("wus:WalkupScanSettings")) {
      return this.data["wus:WalkupScanSettings"]["0"][
        "scantype:ScanSettings"
      ][0]["dd:ScanPlexMode"][0];
    }
    return null;
  }
}
