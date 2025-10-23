"use strict";

import WalkupScanToCompDestination, {
  type WalkupScanToCompDestinationData,
} from "./WalkupScanToCompDestination.js";
import { parseXmlString } from "./ParseXmlString.js";

export interface WalkupScanToCompDestinationsData {
  "wus:WalkupScanToCompDestinations": {
    "wus:WalkupScanToCompDestination": WalkupScanToCompDestinationData[];
  };
}

export default class WalkupScanToCompDestinations {
  private readonly data: WalkupScanToCompDestinationsData;
  constructor(data: WalkupScanToCompDestinationsData) {
    this.data = data;
  }
  static async createWalkupScanToCompDestinations(
    content: string,
  ): Promise<WalkupScanToCompDestinations> {
    const parsed =
      await parseXmlString<WalkupScanToCompDestinationsData>(content);
    return new WalkupScanToCompDestinations(parsed);
  }

  get destinations(): WalkupScanToCompDestination[] {
    const walkupScanToCompDestinations =
      this.data["wus:WalkupScanToCompDestinations"];
    if (
      Object.prototype.hasOwnProperty.call(
        walkupScanToCompDestinations,
        "wus:WalkupScanToCompDestination",
      )
    ) {
      return walkupScanToCompDestinations[
        "wus:WalkupScanToCompDestination"
      ].map((x) => new WalkupScanToCompDestination(x));
    } else {
      return [];
    }
  }
}
