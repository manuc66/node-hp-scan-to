"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, WalkupScanDestinationsData>(
  parser.parseString
);

interface WalkupScanDestinationsData {
  "wus:WalkupScanDestinations": {
    "wus:WalkupScanDestination": WalkupScanDestinationData[];
  };
}

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
  static async createWalkupScanDestination(
    content: string
  ): Promise<WalkupScanDestination> {
    const parsed = await parseString(content);
    return new WalkupScanDestination(
      parsed["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"][0]
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
