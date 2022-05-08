"use strict";

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

  get jobState():
    | "Completed"
    | "Processing"
    | "ReadyToUpload"
    | "Canceled"
    | string {
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

  get imageWidth(): number {
    return parseInt(
      this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
        ?.ImageWidth[0] ?? ""
    );
  }
  get imageHeight(): number {
    return parseInt(
      this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
        ?.ImageHeight[0] ?? ""
    );
  }
  get xResolution(): number {
    return parseInt(
      this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
        ?.ScanSettings?.[0]?.XResolution[0] ?? ""
    );
  }
  get yResolution(): number {
    return parseInt(
      this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
        ?.ScanSettings?.[0]?.YResolution[0] ?? ""
    );
  }
}
