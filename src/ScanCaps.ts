"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, ScanCapsData>(parser.parseString);

export interface ScanCapsData {
  ScanCaps: {
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
    }[];
  };
}

export default class ScanCaps {
  private readonly data: ScanCapsData;

  constructor(data: ScanCapsData) {
    this.data = data;
  }

  static async createScanCaps(content: string): Promise<ScanCaps> {
    const parsed = await parseString(content);
    return new ScanCaps(parsed);
  }

  get platenMaxWidth(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data["ScanCaps"], "Platen")) {
      return Number.parseInt(
        this.data["ScanCaps"]["Platen"][0]["InputSourceCaps"][0]["MaxWidth"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get platenMaxHeight(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data["ScanCaps"], "Platen")) {
      return Number.parseInt(
        this.data["ScanCaps"]["Platen"][0]["InputSourceCaps"][0][
          "MaxHeight"
        ][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxWidth(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data["ScanCaps"], "Adf")) {
      return Number.parseInt(
        this.data["ScanCaps"]["Adf"][0]["InputSourceCaps"][0]["MaxWidth"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfMaxHeight(): number | null {
    if (Object.prototype.hasOwnProperty.call(this.data["ScanCaps"], "Adf")) {
      return Number.parseInt(
        this.data["ScanCaps"]["Adf"][0]["InputSourceCaps"][0]["MaxHeight"][0],
        10,
      );
    } else {
      return null;
    }
  }

  get adfDuplexMaxWidth(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(this.data["ScanCaps"], "Adf")
      && Object.prototype.hasOwnProperty.call(this.data["ScanCaps"]["Adf"][0], "AdfDuplexer")
    ) {
      return Number.parseInt(
        this.data["ScanCaps"]["Adf"][0]["AdfDuplexer"][0]["AdfDuplexMaxWidth"][0],
        10,
      );
    } else {
      return this.adfMaxWidth;
    }
  }

  get adfDuplexMaxHeight(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(this.data["ScanCaps"], "Adf")
      && Object.prototype.hasOwnProperty.call(this.data["ScanCaps"]["Adf"][0], "AdfDuplexer")
    ) {
      return Number.parseInt(
        this.data["ScanCaps"]["Adf"][0]["AdfDuplexer"][0]["AdfDuplexMaxHeight"][0],
        10,
      );
    } else {
      return this.adfMaxHeight;
    }
  }
}
