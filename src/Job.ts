"use strict";
import { Parser } from "xml2js";
const parser = new Parser();
import { promisify } from "util";
const parseString = promisify<string, JobData>(parser.parseString);

export interface JobData {
  "j:Job": {
    ScanJob: {
      PreScanPage?: {
        PageState: string[];
        BinaryURL: string[];
        PageNumber: string[];
        BufferInfo: {
          ImageWidth: string[];
          ImageHeight: string[];
          ScanSettings: {
            XResolution: string[];
            YResolution: string[];
          }[];
        }[];
      }[];
      PostScanPage?: {
        PageNumber: string[];
      }[];
    }[];
    "j:JobState": string[];
  };
}

export default class Job {
  private readonly data: JobData;
  constructor(data: JobData) {
    this.data = data;
  }

  static async createJob(content: string): Promise<Job> {
    const parsed = await parseString(content);
    return new Job(parsed);
  }

  get currentPageNumber(): string | null {
    let preScanPage = this.data["j:Job"].ScanJob[0].PreScanPage;
    if (preScanPage) {
      return preScanPage[0].PageNumber[0];
    } else {
      return null;
    }
  }

  get totalPageNumber(): number | null {
    if (this.data["j:Job"].ScanJob[0].PostScanPage) {
      return parseInt(
        this.data["j:Job"].ScanJob[0].PostScanPage[0].PageNumber[0],
        10
      );
    }
    return null;
  }

  get jobState():
    | "Completed"
    | "Processing"
    | "ReadyToUpload"
    | "Canceled"
    | string {
    return this.data["j:Job"]["j:JobState"][0];
  }

  get pageState(): string | null {
    let preScanPage = this.data["j:Job"].ScanJob[0].PreScanPage;
    if (preScanPage) {
      return preScanPage[0].PageState[0];
    } else {
      return null;
    }
  }

  get binaryURL(): string | null {
    if (this.data["j:Job"].ScanJob[0].PreScanPage) {
      return this.data["j:Job"].ScanJob[0].PreScanPage[0].BinaryURL[0];
    }
    return null;
  }

  get imageWidth(): number | null {
    if (!this.data["j:Job"].ScanJob[0].hasOwnProperty("PreScanPage")) {
      return null;
    }
    return parseInt(
      this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
        ?.ImageWidth[0] ?? ""
    );
  }
  get imageHeight(): number | null {
    if (this.data["j:Job"].ScanJob[0].PreScanPage) {
      return parseInt(
        this.data["j:Job"].ScanJob[0].PreScanPage[0].BufferInfo[0]
          .ImageHeight[0]
      );
    }
    return null;
  }
  get xResolution(): number | null {
    if (this.data["j:Job"].ScanJob[0].PreScanPage) {
      return parseInt(
        this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
          ?.ScanSettings?.[0]?.XResolution[0] ?? ""
      );
    }
    return null;
  }
  get yResolution(): number | null {
    if (this.data["j:Job"].ScanJob[0].hasOwnProperty("PreScanPage")) {
      return parseInt(
        this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
          ?.ScanSettings?.[0]?.YResolution[0] ?? ""
      );
    }
    return null;
  }
}
