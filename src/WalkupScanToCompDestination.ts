"use strict";

import WalkupScanDestination from "./WalkupScanDestination";

export interface WalkupScanToCompDestinationData {
  "dd:Name": string[];
  "dd:ResourceURI": string[];
  "dd3:Hostname": string[];
  "wus:WalkupScanToCompDestination": {
    "wus:WalkupScanToCompSettings": {
      "0": {
        "scantype:Scansettings": {
          "0": {
            "dd:ScanPlexMode": string[];
          };
        };
        "wus:Shortcut": string[]; //can be 'SaveDocument1' or 'SavePhoto1'
      };
    };
  };
}

export default class WalkupScanToCompDestination {
  private readonly data: WalkupScanToCompDestinationData;
  constructor(data: WalkupScanToCompDestinationData) {
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

  get shortcut(): string {
    if (this.data["wus:WalkupScanToCompDestination"].hasOwnProperty("wus:WalkupScanToCompSettings")) {
      return this.data["wus:WalkupScanToCompDestination"]["wus:WalkupScanToCompSettings"][
        "0"
      ]["wus:Shortcut"][0];
    }
    return "";
  }

  getContentType(): string {
    return this.shortcut === "SaveDocument1" ? "Document" : "Photo";
  }
}
