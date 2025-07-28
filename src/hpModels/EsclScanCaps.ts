"use strict";

import { parseXmlString } from "./ParseXmlString";
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
  };
}

export default class EsclScanCaps {
  private readonly data: EsclScanCapsData;

  constructor(data: EsclScanCapsData) {
    this.data = data;
  }

  static async createScanCaps(content: string): Promise<EsclScanCaps> {
    const parsed = await parseXmlString<EsclScanCapsData>(content);
    return new EsclScanCaps(parsed);
  }

  get platenMaxWidth(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data["scan:ScannerCapabilities"], "scan:Platen")) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Platen"][0]["scan:PlatenInputCaps"][0]["scan:MaxWidth"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get platenMaxHeight(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data["scan:ScannerCapabilities"], "scan:Platen")) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Platen"][0]["scan:PlatenInputCaps"][0][
          "scan:MaxHeight"
        ][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxWidth(): number | null {

    if (Object.prototype.hasOwnProperty.call(this.data["scan:ScannerCapabilities"], "scan:Adf")) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0]["scan:AdfSimplexInputCaps"][0]["scan:MaxWidth"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxHeight(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data["scan:ScannerCapabilities"], "scan:Adf")) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0]["scan:AdfSimplexInputCaps"][0]["scan:MaxHeight"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfDuplexMaxWidth(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(this.data["scan:ScannerCapabilities"], "scan:Adf") &&
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0],
        "scan:AdfDuplexInputCaps",
      )
    ) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0]["scan:AdfDuplexInputCaps"][0][
          "scan:MaxWidth"
        ][0],
        10,
      );
    } else {
      return this.adfMaxWidth;
    }
  }

  get adfDuplexMaxHeight(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(this.data["scan:ScannerCapabilities"], "scan:Adf") &&
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0],
        "scan:AdfDuplexInputCaps",
      )
    ) {
      return Number.parseInt(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0]["scan:AdfDuplexInputCaps"][0][
          "scan:MaxHeight"
        ][0],
        10,
      );
    } else {
      return this.adfMaxHeight;
    }
  }

  get hasAdfDetectPaperLoaded(): boolean {
    if (
      Object.prototype.hasOwnProperty.call(this.data["scan:ScannerCapabilities"], "scan:Adf") &&
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0],
        "scan:AdfOptions",
      )
    ) {
      const options =
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0]["scan:AdfOptions"][0]["scan:AdfOption"];
      return options.includes("DetectPaperLoaded");
    }
    return false;
  }

  get hasAdfDuplex(): boolean {
    if (
      Object.prototype.hasOwnProperty.call(this.data["scan:ScannerCapabilities"], "scan:Adf") &&
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0],
        "scan:AdfOptions",
      )
    ) {
      const options =
        this.data["scan:ScannerCapabilities"]["scan:Adf"][0]["scan:AdfOptions"][0]["scan:AdfOption"];
      return options.includes("Duplex");
    }
    return false;
  }


  get isEscl(): boolean {
    return true;
  };
}
