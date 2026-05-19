"use strict";

import { parseXmlString } from "./ParseXmlString.js";

export interface WalkupScanToCompCapsData {
  "wus:WalkupScanToCompCaps": {
    "wus:MaxNetworkDestinations": string[];
    "wus:SupportsMultiItemScanFromPlaten": string[];
    "wus:UserActionTimeout"?: {
      "dd:ValueFloat": string[];
      "dd:Unit": string[];
    }[];
  };
}

export default class WalkupScanToCompCaps {
  private readonly data: WalkupScanToCompCapsData;

  constructor(data: WalkupScanToCompCapsData) {
    this.data = data;
  }

  static async createWalkupScanToCompCaps(
    content: string,
  ): Promise<WalkupScanToCompCaps> {
    const parsed = await parseXmlString<WalkupScanToCompCapsData>(content);
    return new WalkupScanToCompCaps(parsed);
  }

  get supportsMultiItemScanFromPlaten(): boolean {
    return (
      this.data["wus:WalkupScanToCompCaps"][
        "wus:SupportsMultiItemScanFromPlaten"
      ]["0"] === "true"
    );
  }

  get userActionTimeout(): number | null {
    const timeout =
      this.data["wus:WalkupScanToCompCaps"]["wus:UserActionTimeout"];
    if (timeout !== undefined) {
      return Number.parseInt(timeout[0]["dd:ValueFloat"][0], 10);
    }
    return null;
  }
}
