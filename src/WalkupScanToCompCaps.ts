"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, WalkupScanToCompCapsData>(
  parser.parseString
);
export interface WalkupScanToCompCapsData {
  "wus:WalkupScanToCompCaps": {
    "wus:MaxNetworkDestinations": string[];
    "wus:SupportsMultiItemScanFromPlaten": string[];
  };
}

export default class WalkupScanToCompCaps {
  private readonly data: WalkupScanToCompCapsData;

  constructor(data: WalkupScanToCompCapsData) {
    this.data = data;
  }

  static async createWalkupScanToCompCaps(
    content: string
  ): Promise<WalkupScanToCompCaps> {
    const parsed = await parseString(content);
    return new WalkupScanToCompCaps(parsed);
  }

  get supportsMultiItemScanFromPlaten(): boolean {
    return (
      this.data["wus:WalkupScanToCompCaps"][
        "wus:SupportsMultiItemScanFromPlaten"
      ]["0"] === "true"
    );
  }
}
