"use strict";

import { parseXmlString } from "./ParseXmlString.js";
import { InputSource } from "../type/InputSource.js";

export interface ScanCapsData {
  ScanCaps: {
    ColorEntries?: {
      ColorEntry: {
        ColorType: string[];
        Formats: {
          Format: string[]
        }[],
        ImageTransforms: {
          ImageTransform: string[]
        }
      }[]
    }[]
    Platen?: {
      InputSourceCaps: {
        MaxWidth: string[];
        MaxHeight: string[];
      }[];
    }[];
    Adf?: {
      InputSourceCaps: {
        MaxWidth: string[];
        MaxHeight: string[];
      }[];
      AdfDuplexer?: {
        AdfDuplexMaxWidth: string[];
        AdfDuplexMaxHeight: string[];
      }[];
      AdfOptions?: {
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
    const maxWidth = this.data.ScanCaps.Platen?.[0]?.InputSourceCaps?.[0]?.MaxWidth?.[0];
    if (maxWidth !== undefined && maxWidth !== "") {
      return Number.parseInt(
        maxWidth,
        10,
      );
    } else {
      return null;
    }
  }

  get platenMaxHeight(): number | null {
    const maxHeight = this.data.ScanCaps.Platen?.[0]?.InputSourceCaps?.[0]?.MaxHeight?.[0];
    if (maxHeight !== undefined && maxHeight !== "") {
      return Number.parseInt(
        maxHeight,
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxWidth(): number | null {
    const maxWidth = this.data.ScanCaps.Adf?.[0]?.InputSourceCaps?.[0]?.MaxWidth?.[0];
    if (maxWidth !== undefined && maxWidth !== "") {
      return Number.parseInt(
        maxWidth,
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxHeight(): number | null {
    const maxHeight = this.data.ScanCaps.Adf?.[0]?.InputSourceCaps?.[0]?.MaxHeight?.[0];
    if (maxHeight !== undefined && maxHeight !== "") {
      return Number.parseInt(
        maxHeight,
        10,
      );
    } else {
      return null;
    }
  }

  getMaxHeight(source: InputSource): number | null {
    if (source === InputSource.Platen) {
      return this.platenMaxHeight;
    } else {
      return this.adfMaxHeight;
    }
  }

  getMaxWidth(source: InputSource): number | null {
    if (source === InputSource.Platen) {
      return this.platenMaxWidth;
    } else {
      return this.adfMaxWidth;
    }
  }

  getSupportedColorTypes(): string[] {
    if (this.data.ScanCaps.ColorEntries?.[0]?.ColorEntry) {
      return this.data.ScanCaps.ColorEntries[0].ColorEntry.map(
        (x) => x.ColorType[0],
      );
    } else {
      return [];
    }
  }

  getSupportedFormats(colorType: string): string[] {
    if (this.data.ScanCaps.ColorEntries?.[0]?.ColorEntry) {
      const entry = this.data.ScanCaps.ColorEntries[0].ColorEntry.find(
        (x) => x.ColorType[0] === colorType,
      );
      if (entry?.Formats[0]?.Format) {
        return entry.Formats[0].Format;
      }
    }
    return [];
  }

  get adfDuplexMaxWidth(): number | null {
    const maxWidth = this.data.ScanCaps.Adf?.[0]?.AdfDuplexer?.[0]?.AdfDuplexMaxWidth?.[0];
    if (
      maxWidth !== undefined && maxWidth !== ""
    ) {
      return Number.parseInt(
        maxWidth,
        10,
      );
    } else {
      return this.adfMaxWidth;
    }
  }

  get adfDuplexMaxHeight(): number | null {
    const maxHeight = this.data.ScanCaps.Adf?.[0]?.AdfDuplexer?.[0]?.AdfDuplexMaxHeight?.[0];
    if (
      maxHeight !== undefined && maxHeight !== ""
    ) {
      return Number.parseInt(
        maxHeight,
        10,
      );
    } else {
      return this.adfMaxHeight;
    }
  }

  get hasAdfDetectPaperLoaded(): boolean {
    if (
      this.data.ScanCaps.Adf?.[0]?.AdfOptions?.[0]?.AdfOption
    ) {
      const options = this.data.ScanCaps.Adf[0].AdfOptions[0].AdfOption;
      return options.includes("DetectPaperLoaded");
    }
    return false;
  }

  get hasAdfDuplex(): boolean {
    if (
      this.data.ScanCaps.Adf?.[0]?.AdfOptions?.[0]?.AdfOption
    ) {
      const options = this.data.ScanCaps.Adf[0].AdfOptions[0].AdfOption;
      return options.includes("Duplex");
    }
    return false;
  }

  readonly isEscl: boolean = false;
}
