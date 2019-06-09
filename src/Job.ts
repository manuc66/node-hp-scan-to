"use strict";

export interface JobData {
  "j:Job": {
    ScanJob: {
      PreScanPage?: {
        PageState: string[];
        BinaryURL: string[];
        PageNumber: string[];
      }[];
      PostScanPage: {
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

  get currentPageNumber(): string | null {
    let preScanPage = this.data["j:Job"].ScanJob[0].PreScanPage;
    if (preScanPage) {
      return preScanPage[0].PageNumber[0];
    } else {
      return null;
    }
  }

  get totalPageNumber(): number {
    return parseInt(
      this.data["j:Job"].ScanJob[0].PostScanPage[0].PageNumber[0],
      10
    );
  }

  get jobState(): "Completed" | "Processing" | "ReadyToUpload" | string {
    return this.data["j:Job"]["j:JobState"][0];
  }

  get pageState(): string {
    let preScanPage = this.data["j:Job"].ScanJob[0].PreScanPage;
    if (preScanPage) {
      return preScanPage[0].PageState[0];
    } else {
      return "";
    }
  }

  get binaryURL(): string | null {
    let preScanPage = this.data["j:Job"].ScanJob[0].PreScanPage;
    if (preScanPage) {
      return preScanPage[0].BinaryURL[0];
    } else {
      return null;
    }
  }
}
