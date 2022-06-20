"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, WalkupScanManifestData>(
  parser.parseString
);

export interface WalkupScanManifestData {
  "man:Manifest": {
    "map:ResourceMap": {
      "map:ResourceLink": {
        "dd:ResourceURI": string[];
      }[];
      "map:ResourceNode": {
        "map:ResourceLink": {
          "dd:ResourceURI": string[];
        }[];
        "map:ResourceType": {
          "wus:WalkupScanResourceType": string[];
        }[];
      }[];
    }[];
  };
}

export default class WalkupScanManifest {
  private readonly data: WalkupScanManifestData;

  constructor(data: WalkupScanManifestData) {
    this.data = data;
  }
  static async createWalkupScanManifest(
    content: string
  ): Promise<WalkupScanManifest> {
    const parsed = await parseString(content);
    return new WalkupScanManifest(parsed);
  }

  get walkupScanDestinationsURI(): string | null {
    const walkupScanToCompCaps = this.data["man:Manifest"]["map:ResourceMap"][
      "0"
    ]["map:ResourceNode"].find(
      (x) =>
        x["map:ResourceType"][0]["wus:WalkupScanResourceType"][0] ===
        "WalkupScanDestinations"
    );

    if (walkupScanToCompCaps === undefined) {
      return null;
    }

    return (
      this.data["man:Manifest"]["map:ResourceMap"]["0"]["map:ResourceLink"][0][
        "dd:ResourceURI"
      ][0] + walkupScanToCompCaps["map:ResourceLink"][0]["dd:ResourceURI"][0]
    );
  }
}
