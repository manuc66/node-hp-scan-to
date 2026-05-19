"use strict";

import { parseXmlString } from "./ParseXmlString.js";

import type { IScanCaps } from "../IScanCaps.js";
//     this.data["scan:ScannerCapabilities"]["scan:Adf"]["0"]["scan:AdfSimplexInputCaps"]["0"]["scan:MaxWidth"]["0"]
export interface EsclScanCapsData {
  "scan:ScannerCapabilities": {
    "scan:Platen": {
      "scan:PlatenInputCaps": {
        "scan:MaxWidth": string[];
        "scan:MaxHeight": string[];
      }[];
    }[];
    "scan:Adf": {
      "scan:AdfSimplexInputCaps": {
        "scan:MaxWidth": string[];
        "scan:MaxHeight": string[];
      }[];
      "scan:AdfDuplexInputCaps": {
        "scan:MaxWidth": string[];
        "scan:MaxHeight": string[];
      }[];
      "scan:AdfOptions": {
        "scan:AdfOption": string[];
      }[];
    }[];
    "scan:BrightnessSupport"?: {
      "scan:Min": string[];
      "scan:Max": string[];
      "scan:Normal": string[];
    }[];
    "scan:ContrastSupport"?: {
      "scan:Min": string[];
      "scan:Max": string[];
      "scan:Normal": string[];
    }[];
    "scan:GammaSupport"?: {
      "scan:Min": string[];
      "scan:Max": string[];
      "scan:Normal": string[];
    }[];
    "scan:HighlightSupport"?: {
      "scan:Min": string[];
      "scan:Max": string[];
      "scan:Normal": string[];
    }[];
    "scan:ShadowSupport"?: {
      "scan:Min": string[];
      "scan:Max": string[];
      "scan:Normal": string[];
    }[];
  };
}

function getToneMapSupport(
  supportData:
    | { "scan:Min"?: string[]; "scan:Max"?: string[]; "scan:Normal"?: string[] }
    | undefined,
): { min: number; max: number; defaultValue: number } | null {
  if (!supportData) {
    return null;
  }
  return {
    min: Number.parseInt(supportData["scan:Min"]?.[0] ?? "0", 10),
    max: Number.parseInt(supportData["scan:Max"]?.[0] ?? "0", 10),
    defaultValue: Number.parseInt(supportData["scan:Normal"]?.[0] ?? "0", 10),
  };
}

export default class EsclScanCaps implements IScanCaps {
  private readonly data: EsclScanCapsData;

  constructor(data: EsclScanCapsData) {
    this.data = data;
  }

  static async createScanCaps(content: string): Promise<EsclScanCaps> {
    const parsed = await parseXmlString<EsclScanCapsData>(content);
    return new EsclScanCaps(parsed);
  }

  get platenMaxWidth(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"],
        "scan:Platen",
      )
    ) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Platen"][0][
          "scan:PlatenInputCaps"
        ][0]["scan:MaxWidth"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get platenMaxHeight(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"],
        "scan:Platen",
      )
    ) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Platen"][0][
          "scan:PlatenInputCaps"
        ][0]["scan:MaxHeight"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxWidth(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"],
        "scan:Adf",
      )
    ) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0][
          "scan:AdfSimplexInputCaps"
        ][0]["scan:MaxWidth"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxHeight(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"],
        "scan:Adf",
      )
    ) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0][
          "scan:AdfSimplexInputCaps"
        ][0]["scan:MaxHeight"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfDuplexMaxWidth(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"],
        "scan:Adf",
      ) &&
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0],
        "scan:AdfDuplexInputCaps",
      )
    ) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0][
          "scan:AdfDuplexInputCaps"
        ][0]["scan:MaxWidth"][0],
        10,
      );
    } else {
      return this.adfMaxWidth;
    }
  }

  get adfDuplexMaxHeight(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"],
        "scan:Adf",
      ) &&
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0],
        "scan:AdfDuplexInputCaps",
      )
    ) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0][
          "scan:AdfDuplexInputCaps"
        ][0]["scan:MaxHeight"][0],
        10,
      );
    } else {
      return this.adfMaxHeight;
    }
  }

  get hasAdfDetectPaperLoaded(): boolean {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"],
        "scan:Adf",
      ) &&
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0],
        "scan:AdfOptions",
      )
    ) {
      const options =
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0][
          "scan:AdfOptions"
        ][0]["scan:AdfOption"];
      return options.includes("DetectPaperLoaded");
    }
    return false;
  }

  get hasAdfDuplex(): boolean {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"],
        "scan:Adf",
      ) &&
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0],
        "scan:AdfOptions",
      )
    ) {
      const options =
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0][
          "scan:AdfOptions"
        ][0]["scan:AdfOption"];
      return options.includes("Duplex");
    }
    return false;
  }

  readonly isEscl: boolean = true;

  get brightnessSupport(): {
    min: number;
    max: number;
    defaultValue: number;
  } | null {
    const caps = this.data["scan:ScannerCapabilities"];
    return getToneMapSupport(caps["scan:BrightnessSupport"]?.[0]);
  }

  get contrastSupport(): {
    min: number;
    max: number;
    defaultValue: number;
  } | null {
    const caps = this.data["scan:ScannerCapabilities"];
    return getToneMapSupport(caps["scan:ContrastSupport"]?.[0]);
  }

  get gammaSupport(): { min: number; max: number; defaultValue: number } | null {
    const caps = this.data["scan:ScannerCapabilities"];
    return getToneMapSupport(caps["scan:GammaSupport"]?.[0]);
  }

  get highlightSupport(): {
    min: number;
    max: number;
    defaultValue: number;
  } | null {
    const caps = this.data["scan:ScannerCapabilities"];
    return getToneMapSupport(caps["scan:HighlightSupport"]?.[0]);
  }

  get shadowSupport(): { min: number; max: number; defaultValue: number } | null {
    const caps = this.data["scan:ScannerCapabilities"];
    return getToneMapSupport(caps["scan:ShadowSupport"]?.[0]);
  }
}
