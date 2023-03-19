"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, ScanCapsData>(parser.parseString);
export interface ScanCapsData {}

export default class ScanCaps {
  private readonly data: ScanCapsData;

  constructor(data: ScanCapsData) {
    this.data = data;
  }

  static async createScanCaps(content: string): Promise<ScanCaps> {
    const parsed = await parseString(content);
    return new ScanCaps(parsed);
  }
}
