"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, DiscoveryTreeData>(parser.parseString);

export interface DiscoveryTreeData {
  "ledm:DiscoveryTree": {
    "ledm:SupportedIfc": {
      "ledm:ManifestURI": string[];
      "dd:ResourceType": string[];
    }[];
  };
}

export default class DiscoveryTree {
  private readonly data: DiscoveryTreeData;

  constructor(data: DiscoveryTreeData) {
    this.data = data;
  }
  static async createDiscoveryTree(content: string): Promise<DiscoveryTree> {
    const parsed = await parseString(content);
    return new DiscoveryTree(parsed);
  }

  get WalkupScanToCompManifestURI(): string | null {
    const hpLedmWalkupScanToCompManifest = this.data["ledm:DiscoveryTree"][
      "ledm:SupportedIfc"
    ].find(
      (x) => x["dd:ResourceType"][0] === "ledm:hpLedmWalkupScanToCompManifest"
    );
    if (hpLedmWalkupScanToCompManifest !== undefined) {
      return hpLedmWalkupScanToCompManifest["ledm:ManifestURI"][0];
    }
    return null;
  }
  get WalkupScanManifestURI(): string | null {
    const hpLedmWalkupScanToCompManifest = this.data["ledm:DiscoveryTree"][
      "ledm:SupportedIfc"
    ].find((x) => x["dd:ResourceType"][0] === "hpCnxWalkupScanManifest");
    if (hpLedmWalkupScanToCompManifest === undefined) {
      return null;
    }
    return hpLedmWalkupScanToCompManifest["ledm:ManifestURI"][0];
  }
  get ScanJobManifestURI(): string | null {
    const hpLedmWalkupScanToCompManifest = this.data["ledm:DiscoveryTree"][
      "ledm:SupportedIfc"
    ].find((x) => x["dd:ResourceType"][0] === "ledm:hpLedmScanJobManifest");
    if (hpLedmWalkupScanToCompManifest === undefined) {
      return null;
    }
    return hpLedmWalkupScanToCompManifest["ledm:ManifestURI"][0];
  }
}
