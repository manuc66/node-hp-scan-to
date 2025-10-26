"use strict";

import { parseXmlString } from "./ParseXmlString.js";
import type { KnownShortcut } from "../type/KnownShortcut.js";
import { ScanPlexMode } from "./ScanPlexMode.js";
import { EnumUtils } from "./EnumUtils.js";

interface WalkupScanToCompDestinationRoot {
  "wus:WalkupScanToCompDestination": WalkupScanToCompDestinationData;
}

export interface WalkupScanToCompDestinationData {
  "dd:Name": string[];
  "dd:ResourceURI": string[];
  "dd3:Hostname": string[];
  "wus:WalkupScanToCompSettings": {
    "scantype:ScanSettings": {
      "dd:ScanPlexMode": string[];
    }[];
    "wus:Shortcut": KnownShortcut[];
  }[];
}

export default class WalkupScanToCompDestination {
  private readonly data: WalkupScanToCompDestinationData;
  constructor(data: WalkupScanToCompDestinationData) {
    this.data = data;
  }
  static async createWalkupScanToCompDestination(
    content: string,
  ): Promise<WalkupScanToCompDestination> {
    const parsed =
      await parseXmlString<WalkupScanToCompDestinationRoot>(content);
    return new WalkupScanToCompDestination(
      parsed["wus:WalkupScanToCompDestination"],
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
      Object.prototype.hasOwnProperty.call(
        this.data,
        "wus:WalkupScanToCompSettings",
      )
    ) {
      return this.data["wus:WalkupScanToCompSettings"]["0"]["wus:Shortcut"][0];
    }
    return null;
  }

  get scanPlexMode(): ScanPlexMode | null {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data,
        "wus:WalkupScanToCompSettings",
      )
    ) {
      return EnumUtils.getState(
        "ScanPlexMode",
        ScanPlexMode,
        this.data["wus:WalkupScanToCompSettings"]["0"]["scantype:ScanSettings"][
          "0"
        ]["dd:ScanPlexMode"][0],
      );
    }
    return null;
  }
}
