"use strict";

import WalkupScanDestination, {
  WalkupScanDestinationData
} from "./WalkupScanDestination";

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

  get destinations(): WalkupScanDestination[] {
    let walkupScanDestinations = this.data["wus:WalkupScanDestinations"];
    if (walkupScanDestinations.hasOwnProperty("wus:WalkupScanDestination")) {
      return walkupScanDestinations["wus:WalkupScanDestination"].map(
        x => new WalkupScanDestination(x)
      );
    } else {
      return [];
    }
  }
}
