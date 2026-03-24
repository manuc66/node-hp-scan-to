"use strict";

import { parseXmlString } from "./ParseXmlString.js";
import { InputSource } from "../type/InputSource";

export interface ScanCapsData {
  ScanCaps: {
    ColorEntries: {
      "ColorEntry": {
        "ColorType": string[];
        "Formats": {
          "Format": []
        }[],
        "ImageTransforms": {
          "ImageTransform": string[]
        }
      }[]
    }[]
    Platen: {
      InputSourceCaps: {
        MaxWidth: string[];
        MaxHeight: string[];
      }[];
    }[];
    Adf: {
      InputSourceCaps: {
        MaxWidth: string[];
        MaxHeight: string[];
      }[];
      AdfDuplexer: {
        AdfDuplexMaxWidth: string[];
        AdfDuplexMaxHeight: string[];
      }[];
      AdfOptions: {
        AdfOption: string[];
      }[];
    }[];
  };
}

export default class ScanCaps {
  private readonly data: ScanCapsData;

  constructor(data: ScanCapsData) {
    this.data = data;
  }

  static async createScanCaps(content: string): Promise<ScanCaps> {
    const parsed = await parseXmlString<ScanCapsData>(content);
    return new ScanCaps(parsed);
  }

  get platenMaxWidth(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data.ScanCaps, "Platen")) {
      return Number.parseInt(
        this.data.ScanCaps.Platen[0].InputSourceCaps[0].MaxWidth[0],
        10,
      );
    } else {
      return null;
    }
  }

  get platenMaxHeight(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data.ScanCaps, "Platen")) {
      return Number.parseInt(
        this.data.ScanCaps.Platen[0].InputSourceCaps[0].MaxHeight[0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxWidth(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data.ScanCaps, "Adf")) {
      return Number.parseInt(
        this.data.ScanCaps.Adf[0].InputSourceCaps[0].MaxWidth[0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxHeight(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data.ScanCaps, "Adf")) {
      return Number.parseInt(
        this.data.ScanCaps.Adf[0].InputSourceCaps[0].MaxHeight[0],
        10,
      );
    } else {
      return null;
    }
  }

  getMaxHeight(source: InputSource): number | null {
    if (source === InputSource.Platen) {
      return this.platenMaxHeight;
    } else if (source === InputSource.Adf) {
      return this.adfMaxHeight;
    }
    return null;
  }

  getMaxWidth(source: InputSource): number | null {
    if (source === InputSource.Platen) {
      return this.platenMaxWidth;
    } else if (source === InputSource.Adf) {
      return this.adfMaxWidth;
    }
    return null;
  }

  getSupportedColorTypes(): string[] {
    if (Object.prototype.hasOwnProperty.call(this.data["ScanCaps"], "ColorEntries")) {
      return this.data["ScanCaps"]["ColorEntries"][0]["ColorEntry"].map(
        (x) => x["ColorType"][0],
      );
    } else {
      return [];
    }
  }

  getSupportedFormats(colorType: string): string[] {
    if (Object.prototype.hasOwnProperty.call(this.data["ScanCaps"], "ColorEntries")) {
      return this.data["ScanCaps"]["ColorEntries"][0]["ColorEntry"].filter(
        (x) => x["ColorType"][0] === colorType,
      )[0]["Formats"][0]["Format"];
    } else {
      return [];
    }
  }

  get adfDuplexMaxWidth(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(this.data.ScanCaps, "Adf") &&
      Object.prototype.hasOwnProperty.call(
        this.data.ScanCaps.Adf[0],
        "AdfDuplexer",
      )
    ) {
      return Number.parseInt(
        this.data.ScanCaps.Adf[0].AdfDuplexer[0].AdfDuplexMaxWidth[0],
        10,
      );
    } else {
      return this.adfMaxWidth;
    }
  }

  get adfDuplexMaxHeight(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(this.data.ScanCaps, "Adf") &&
      Object.prototype.hasOwnProperty.call(
        this.data.ScanCaps.Adf[0],
        "AdfDuplexer",
      )
    ) {
      return Number.parseInt(
        this.data.ScanCaps.Adf[0].AdfDuplexer[0].AdfDuplexMaxHeight[0],
        10,
      );
    } else {
      return this.adfMaxHeight;
    }
  }

  get hasAdfDetectPaperLoaded(): boolean {
    if (
      Object.prototype.hasOwnProperty.call(this.data.ScanCaps, "Adf") &&
      Object.prototype.hasOwnProperty.call(
        this.data.ScanCaps.Adf[0],
        "AdfOptions",
      )
    ) {
      const options = this.data.ScanCaps.Adf[0].AdfOptions[0].AdfOption;
      return options.includes("DetectPaperLoaded");
    }
    return false;
  }

  get hasAdfDuplex(): boolean {
    if (
      Object.prototype.hasOwnProperty.call(this.data.ScanCaps, "Adf") &&
      Object.prototype.hasOwnProperty.call(
        this.data.ScanCaps.Adf[0],
        "AdfOptions",
      )
    ) {
      const options = this.data.ScanCaps.Adf[0].AdfOptions[0].AdfOption;
      return options.includes("Duplex");
    }
    return false;
  }

  readonly isEscl: boolean = false;
}
