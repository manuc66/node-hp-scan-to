"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, ScanJobManifestData>(parser.parseString);

export interface ScanJobManifestData {
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
          "scan:ScanResourceType": string[];
        }[];
      }[];
    }[];
  };
}

export default class ScanJobManifest {
  private readonly data: ScanJobManifestData;

  constructor(data: ScanJobManifestData) {
    this.data = data;
  }
  static async createScanJobManifest(
    content: string
  ): Promise<ScanJobManifest> {
    const parsed = await parseString(content);
    return new ScanJobManifest(parsed);
  }

  get ScanCapsURI(): string | null {
    const scanCaps = this.data["man:Manifest"]["map:ResourceMap"]["0"][
      "map:ResourceNode"
    ].find(
      (x) => x["map:ResourceType"][0]["scan:ScanResourceType"][0] === "ScanCaps"
    );

    if (scanCaps === undefined) {
      return null;
    }

    return (
      this.data["man:Manifest"]["map:ResourceMap"]["0"]["map:ResourceLink"][0][
        "dd:ResourceURI"
      ][0] + scanCaps["map:ResourceLink"][0]["dd:ResourceURI"][0]
    );
  }
}
