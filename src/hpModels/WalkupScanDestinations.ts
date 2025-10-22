"use strict";

import WalkupScanDestination, {
  WalkupScanDestinationData,
} from "./WalkupScanDestination.js";
import { parseXmlString } from "./ParseXmlString.js";

export interface WalkupScanDestinationsData {
  "wus:WalkupScanDestinations": {
    "wus:WalkupScanDestination": WalkupScanDestinationData[];
  };
}

export default class WalkupScanDestinations {
  private readonly data: WalkupScanDestinationsData;
  constructor(data: WalkupScanDestinationsData) {
    this.data = data;
  }
  static async createWalkupScanDestinations(
    content: string,
  ): Promise<WalkupScanDestinations> {
    const parsed = await parseXmlString<WalkupScanDestinationsData>(content);
    return new WalkupScanDestinations(parsed);
  }

  get destinations(): WalkupScanDestination[] {
    const walkupScanDestinations = this.data["wus:WalkupScanDestinations"];
    if (
      Object.prototype.hasOwnProperty.call(
        walkupScanDestinations,
        "wus:WalkupScanDestination",
      )
    ) {
      return walkupScanDestinations["wus:WalkupScanDestination"].map(
        (x) => new WalkupScanDestination(x),
      );
    } else {
      return [];
    }
  }
}
