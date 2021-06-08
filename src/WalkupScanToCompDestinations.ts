"use strict";

import WalkupScanToCompDestination, {
  WalkupScanToCompDestinationData,
} from "./WalkupScanToCompDestination";

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

  get destinations(): WalkupScanToCompDestination[] {
    let WalkupScanToCompDestinations = this.data[
      "wus:WalkupScanToCompDestinations"
    ];
    if (
      WalkupScanToCompDestinations.hasOwnProperty(
        "wus:WalkupScanToCompDestination"
      )
    ) {
      return WalkupScanToCompDestinations[
        "wus:WalkupScanToCompDestination"
      ].map((x) => new WalkupScanToCompDestination(x));
    } else {
      return [];
    }
  }
}
