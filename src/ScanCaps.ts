"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, ScanCapsData>(parser.parseString);

export interface ScanCapsData {
  "ScanCaps": {
    "Platen": {
      "InputSourceCaps": {
        "MaxWidth": number,
        "MaxHeight": number
      }[]
    }[],
    "Adf": {
      "InputSourceCaps": {
        "MaxWidth": number,
        "MaxHeight": number
      }[]
    }[]
  }
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

  get PlatenMaxWidth(): number | null {
    return this.data["ScanCaps"]["Platen"][0]["InputSourceCaps"][0]["MaxWidth"] || null
  }

  get PlatenMaxHeight(): number | null {
    return this.data["ScanCaps"]["Platen"][0]["InputSourceCaps"][0]["MaxHeight"] || null
  }

  get AdfMaxWidth(): number | null {
    return this.data["ScanCaps"]["Adf"][0]["InputSourceCaps"][0]["MaxWidth"] || null
  }

  get AdfMaxHeight(): number | null {
    return this.data["ScanCaps"]["Adf"][0]["InputSourceCaps"][0]["MaxHeight"] || null
  }
}
