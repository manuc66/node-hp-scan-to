"use strict";

export interface WalkupScanDestinationData {
  "dd:Name": string[];
  "dd:ResourceURI": string[];
  "wus:WalkupScanDestinations": {
    "wus:WalkupScanDestination": {
      "0": {
        "wus:WalkupScanSettings": {
          "0": {
            "wus:Shortcut": string[];
          };
        };
      };
    };
  };
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
    return this.data["dd:ResourceURI"][0];
  }

  get resourceURI(): string {
    return this.data["dd:ResourceURI"][0];
  }

  get shortcut(): string {
    return this.data["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"][
      "0"
    ]["wus:WalkupScanSettings"]["0"]["wus:Shortcut"][0];
  }

  getContentType(): string {
    return this.shortcut === "SavePDF" ? "Document" : "Photo";
  }
}
