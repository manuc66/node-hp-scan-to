"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, WalkupScanToCompManifestData>(
  parser.parseString
);

export interface WalkupScanToCompManifestData {
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
          "wus:WalkupScanToCompResourceType": string[];
        }[];
      }[];
    }[];
  };
}

export default class WalkupScanToCompManifest {
  private readonly data: WalkupScanToCompManifestData;

  constructor(data: WalkupScanToCompManifestData) {
    this.data = data;
  }
  static async createWalkupScanToCompManifest(
    content: string
  ): Promise<WalkupScanToCompManifest> {
    const parsed = await parseString(content);
    return new WalkupScanToCompManifest(parsed);
  }

  get WalkupScanToCompCapsURI(): string | null {
    const walkupScanToCompCaps = this.data["man:Manifest"]["map:ResourceMap"][
      "0"
    ]["map:ResourceNode"].find(
      (x) =>
        x["map:ResourceType"][0]["wus:WalkupScanToCompResourceType"][0] ===
        "WalkupScanToCompCaps"
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
