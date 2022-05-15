"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, any>(parser.parseString);

import WalkupScanToCompDestinations, { WalkupScanToCompDestinationsData } from "./WalkupScanToCompDestinations";

export interface WalkupScanToCompDestinationData {
  "dd:Name": string[];
  "dd:ResourceURI": string[];
  "dd3:Hostname": string[];
  "wus:WalkupScanToCompSettings": {
    "scantype:ScanSettings": {
      "dd:ScanPlexMode": string[];
    }[];
    "wus:Shortcut": string[]; //can be 'SaveDocument1' or 'SavePhoto1'
  }[];
}

export default class WalkupScanToCompDestination {
  private readonly data: WalkupScanToCompDestinationData;
  constructor(data: WalkupScanToCompDestinationData) {
    this.data = data;
  } static async createWalkupScanToCompDestination(
    content: string
  ): Promise<WalkupScanToCompDestination> {
    const parsed = (await parseString(content)) as {
      "wus:WalkupScanToCompDestination": WalkupScanToCompDestinationData;
    };
    return new WalkupScanToCompDestination(
      parsed["wus:WalkupScanToCompDestination"]
    );
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
    if (this.data.hasOwnProperty("wus:WalkupScanToCompSettings")) {
      return this.data["wus:WalkupScanToCompSettings"]["0"]["wus:Shortcut"][0];
    }
    return null;
  }

  get scanPlexMode(): string | null {
    if (this.data.hasOwnProperty("wus:WalkupScanToCompSettings")) {
      return (
        this.data["wus:WalkupScanToCompSettings"]["0"]["scantype:ScanSettings"][
          "0"
        ]["dd:ScanPlexMode"][0] || null
      );
    }
    return null;
  }

  getContentType(): "Document" | "Photo" {
    return this.shortcut === "SaveDocument1" ? "Document" : "Photo";
  }
}
