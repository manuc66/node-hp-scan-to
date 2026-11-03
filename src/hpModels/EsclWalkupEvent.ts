"use strict";

import { parseXmlString } from "./ParseXmlString.js";
import { ScanPlexMode } from "./ScanPlexMode.js";

export enum EsclWalkupEventType {
  HostSelected = "HostSelected",
  ScanRequested = "ScanRequested",
  ScanPagesComplete = "ScanPagesComplete",
}

interface EsclWalkupEventData {
  "scan:WalkupScanEvent": {
    "scan:ResourceURI"?: string[];
    "scan:HostIdentifier"?: string[];
    "scan:Connection"?: string[];
    "scan:Event": string[];
    "scan:Shortcut"?: string[];
    "scan:ScanSettings"?: {
      "scan:Duplex"?: string[];
    }[];
  };
}

/**
 * Event received while long-polling
 * `GET /eSCL/WalkupSubscriptions/{id}/Event`.
 */
export default class EsclWalkupEvent {
  private readonly data: EsclWalkupEventData["scan:WalkupScanEvent"];

  constructor(data: EsclWalkupEventData["scan:WalkupScanEvent"]) {
    this.data = data;
  }

  static async create(content: string): Promise<EsclWalkupEvent> {
    const parsed = await parseXmlString<EsclWalkupEventData>(content);
    return new EsclWalkupEvent(parsed["scan:WalkupScanEvent"]);
  }

  get eventType(): EsclWalkupEventType {
    return this.data["scan:Event"][0] as EsclWalkupEventType;
  }

  get resourceURI(): string | null {
    return this.data["scan:ResourceURI"]?.[0] ?? null;
  }

  get hostIdentifier(): string | null {
    return this.data["scan:HostIdentifier"]?.[0] ?? null;
  }

  get shortcut(): string | null {
    return this.data["scan:Shortcut"]?.[0] ?? null;
  }

  get scanPlexMode(): ScanPlexMode | null {
    const duplex = this.data["scan:ScanSettings"]?.[0]?.["scan:Duplex"]?.[0];
    if (duplex === undefined) {
      return null;
    }
    return duplex === "true" ? ScanPlexMode.Duplex : ScanPlexMode.Simplex;
  }
}
