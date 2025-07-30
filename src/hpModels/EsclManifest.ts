"use strict";

import { parseXmlString } from "./ParseXmlString";

export interface EsclScanJobManifestData {
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

export default class EsclScanJobManifest {
  private readonly data: EsclScanJobManifestData;

  constructor(data: EsclScanJobManifestData) {
    this.data = data;
  }
  static async createScanJobManifest(
    content: string,
  ): Promise<EsclScanJobManifest> {
    const parsed = await parseXmlString<EsclScanJobManifestData>(content);
    return new EsclScanJobManifest(parsed);
  }

  private getResourceURI(resourceType: string): string | null {
    const resourceNode = this.data["man:Manifest"]["map:ResourceMap"]["0"][
      "map:ResourceNode"
    ].find(
      (x) =>
        x["map:ResourceType"][0]["scan:ScanResourceType"][0] === resourceType,
    );

    if (resourceNode === undefined) {
      return null;
    }

    return (
      this.data["man:Manifest"]["map:ResourceMap"]["0"]["map:ResourceLink"][0][
        "dd:ResourceURI"
      ][0] + resourceNode["map:ResourceLink"][0]["dd:ResourceURI"][0]
    );
  }

  get scanCapsURI(): string | null {
    return this.getResourceURI("ScannerCapabilities");
  }

  get scanJobsURI(): string | null {
    return this.getResourceURI("ScanJobs");
  }
}
