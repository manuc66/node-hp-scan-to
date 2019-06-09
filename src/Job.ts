"use strict";

export interface JobData {
  "j:Job": {
    ScanJob: {
      "0": {
        PreScanPage: {
          "0": {
            PageState: {
              "0": string;
            };
            BinaryURL: {
              "0": string;
            };
            PageNumber: {
              "0": string | number;
            };
          };
        };
        PostScanPage: {
          "0": {
            PageNumber: {
              "0": string | number;
            };
          };
        };
      };
    };
    "j:JobState": {
      "0": string;
    };
  };
}

export default class Job {
  private readonly data: JobData;
  constructor(data: JobData) {
    this.data = data;
  }

  get currentPageNumber(): string | number {
    return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].PageNumber["0"];
  }

  get totalPageNumber(): string | number {
    return this.data["j:Job"].ScanJob["0"].PostScanPage["0"].PageNumber["0"];
  }

  get jobState(): string {
    return this.data["j:Job"]["j:JobState"][0];
  }

  get pageState(): string {
    return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].PageState["0"];
  }

  get binaryURL(): string {
    return this.data["j:Job"].ScanJob["0"].PreScanPage["0"].BinaryURL["0"];
  }
}
