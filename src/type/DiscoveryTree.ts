"use strict";

import { parseXmlString } from "../hpModels/ParseXmlString";

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
    const parsed = await parseXmlString<DiscoveryTreeData>(content);
    return new DiscoveryTree(parsed);
  }

  private getManifestURI(resourceType: string): string | null {
    const manifest = this.data["ledm:DiscoveryTree"]["ledm:SupportedIfc"].find(
      (x) => x["dd:ResourceType"][0] === resourceType,
    );
    return manifest ? manifest["ledm:ManifestURI"][0] : null;
  }

  get WalkupScanToCompManifestURI(): string | null {
    return this.getManifestURI("ledm:hpLedmWalkupScanToCompManifest");
  }

  get WalkupScanManifestURI(): string | null {
    return this.getManifestURI("hpCnxWalkupScanManifest");
  }

  get ScanJobManifestURI(): string | null {
    return this.getManifestURI("ledm:hpLedmScanJobManifest");
  }

  get EsclManifestURI(): string | null {
    return this.getManifestURI("eSCL:eSclManifest");
  }
}
