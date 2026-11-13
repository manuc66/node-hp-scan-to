"use strict";

import { parseXmlString } from "../hpModels/ParseXmlString.js";

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

  /**
   * A tree with no manifests at all. Used when the device does not serve
   * /DevMgmt/DiscoveryTree.xml (e.g. newer HP firmware that only exposes the
   * standard eSCL endpoints), so callers can fall back to well-known paths.
   */
  static empty(): DiscoveryTree {
    return new DiscoveryTree({
      "ledm:DiscoveryTree": { "ledm:SupportedIfc": [] },
    });
  }

  /**
   * True when the device served no supported interface at all.
   */
  get isEmpty(): boolean {
    return (
      (this.data["ledm:DiscoveryTree"]["ledm:SupportedIfc"]?.length ?? 0) === 0
    );
  }

  /**
   * True when the tree advertises at least one scan interface we know how to
   * drive. A non-empty tree that only contains unrelated services still
   * counts as "no scan interface" and allows the eSCL probe.
   */
  get hasScanInterface(): boolean {
    return (
      this.WalkupScanToCompManifestURI !== null ||
      this.WalkupScanManifestURI !== null ||
      this.ScanJobManifestURI !== null ||
      this.EsclManifestURI !== null
    );
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
