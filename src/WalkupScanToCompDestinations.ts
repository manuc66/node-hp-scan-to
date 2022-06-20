"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, WalkupScanToCompDestinationsData>(
  parser.parseString
);

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
  static async createWalkupScanToCompDestinations(
    content: string
  ): Promise<WalkupScanToCompDestinations> {
    const parsed = await parseString(content);
    return new WalkupScanToCompDestinations(parsed);
  }

  get destinations(): WalkupScanToCompDestination[] {
    let walkupScanToCompDestinations =
      this.data["wus:WalkupScanToCompDestinations"];
    if (
      walkupScanToCompDestinations.hasOwnProperty(
        "wus:WalkupScanToCompDestination"
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
