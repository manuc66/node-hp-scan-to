"use strict";
import type { KnownShortcut } from "../type/KnownShortcut.js";
import { parseXmlString } from "./ParseXmlString.js";
import { EnumUtils } from "./EnumUtils.js";
import { ScanPlexMode } from "./ScanPlexMode.js";

interface WalkupScanDestinationsData {
  "wus:WalkupScanDestinations": {
    "wus:WalkupScanDestination": WalkupScanDestinationData[];
  };
}

export interface WalkupScanDestinationData {
  "dd:Name": string[];
  "dd3:Hostname": string[];
  "dd:ResourceURI": string[];
  "wus:WalkupScanSettings": {
    "scantype:ScanSettings": {
      "dd:ScanPlexMode": string[];
    }[];
    "wus:Shortcut": KnownShortcut[];
  }[];
}

export default class WalkupScanDestination {
  private readonly data: WalkupScanDestinationData;
  constructor(data: WalkupScanDestinationData) {
    this.data = data;
  }
  static async createWalkupScanDestination(
    content: string,
  ): Promise<WalkupScanDestination> {
    const parsed = await parseXmlString<WalkupScanDestinationsData>(content);
    return new WalkupScanDestination(
      parsed["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"][0],
    );
  }

  get name(): string {
    return this.data["dd:Name"][0];
  }

  get hostname(): string {
    return this.data["dd3:Hostname"][0];
  }

  get resourceURI(): string {
    return this.data["dd:ResourceURI"][0];
  }

  get shortcut(): null | KnownShortcut {
    if (
      Object.prototype.hasOwnProperty.call(this.data, "wus:WalkupScanSettings")
    ) {
      return this.data["wus:WalkupScanSettings"]["0"]["wus:Shortcut"][0];
    }
    return null;
  }

  get scanPlexMode(): ScanPlexMode | null {
    if (
      Object.prototype.hasOwnProperty.call(this.data, "wus:WalkupScanSettings")
    ) {
      return EnumUtils.getState(
        "ScanPlexMode",
        ScanPlexMode,
        this.data["wus:WalkupScanSettings"]["0"]["scantype:ScanSettings"][0][
          "dd:ScanPlexMode"
        ][0],
      );
    }
    return null;
  }
}
