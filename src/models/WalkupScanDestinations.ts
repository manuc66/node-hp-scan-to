"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, WalkupScanDestinationsData>(
  parser.parseString
);

import WalkupScanDestination, {
  WalkupScanDestinationData,
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
  static async createWalkupScanDestinations(
    content: string
  ): Promise<WalkupScanDestinations> {
    const parsed = await parseString(content);
    return new WalkupScanDestinations(parsed);
  }

  get destinations(): WalkupScanDestination[] {
    let walkupScanDestinations = this.data["wus:WalkupScanDestinations"];
    if (walkupScanDestinations.hasOwnProperty("wus:WalkupScanDestination")) {
      return walkupScanDestinations["wus:WalkupScanDestination"].map(
        (x) => new WalkupScanDestination(x)
      );
    } else {
      return [];
    }
  }
}
