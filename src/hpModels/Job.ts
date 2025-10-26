"use strict";

import { parseXmlString } from "./ParseXmlString.js";
import { EnumUtils } from "./EnumUtils.js";

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
            InputSource: string[];
            ContentType: string[];
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

export enum JobState {
  Completed = "Completed",
  Processing = "Processing",
  Canceled = "Canceled",
}

export enum PageState {
  ReadyToUpload = "ReadyToUpload",
  PreparingScan = "PreparingScan",
}

export default class Job {
  private readonly data: JobData;
  constructor(data: JobData) {
    this.data = data;
  }

  static async createJob(content: string): Promise<Job> {
    const parsed = await parseXmlString<JobData>(content);
    return new Job(parsed);
  }

  get currentPageNumber(): string | null {
    const preScanPage = this.data["j:Job"].ScanJob[0].PreScanPage;
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
        10,
      );
    }
    return null;
  }

  get jobState(): JobState {
    const jobStateStr = this.data["j:Job"]["j:JobState"][0];
    return EnumUtils.getState("JobState", JobState, jobStateStr);
  }

  get pageState(): PageState | null {
    const preScanPage = this.data["j:Job"].ScanJob[0].PreScanPage;

    if (preScanPage) {
      return EnumUtils.getState(
        "PageState",
        PageState,
        preScanPage[0].PageState[0],
      );
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
    if (
      !Object.prototype.hasOwnProperty.call(
        this.data["j:Job"].ScanJob[0],
        "PreScanPage",
      )
    ) {
      return null;
    }
    return parseInt(
      this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
        ?.ImageWidth[0] ?? "",
    );
  }
  get imageHeight(): number | null {
    if (this.data["j:Job"].ScanJob[0].PreScanPage) {
      return parseInt(
        this.data["j:Job"].ScanJob[0].PreScanPage[0].BufferInfo[0]
          .ImageHeight[0],
      );
    }
    return null;
  }
  get xResolution(): number | null {
    if (this.data["j:Job"].ScanJob[0].PreScanPage) {
      return parseInt(
        this.data["j:Job"].ScanJob[0].PreScanPage[0]?.BufferInfo?.[0]
          ?.ScanSettings?.[0]?.XResolution[0] ?? "",
      );
    }
    return null;
  }
  get yResolution(): number | null {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["j:Job"].ScanJob[0],
        "PreScanPage",
      )
    ) {
      return parseInt(
        this.data["j:Job"].ScanJob[0].PreScanPage?.[0]?.BufferInfo?.[0]
          ?.ScanSettings?.[0]?.YResolution[0] ?? "",
      );
    }
    return null;
  }
}
