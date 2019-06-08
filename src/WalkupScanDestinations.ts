"use strict";

import WalkupScanDestination from "./WalkupScanDestination";

export default class WalkupScanDestinations {
  constructor(data) {
    this.data = data;
  }

  get destinations() : WalkupScanDestination[] {
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
