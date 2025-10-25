"use strict";
import { InputSource } from "../type/InputSource.js";
import { parseXmlString } from "./ParseXmlString.js";
import type { IScanStatus } from "./IScanStatus.js";
import { ScannerState } from "./ScannerState.js";
import { AdfState } from "./AdfState.js";
import { EnumUtils } from "./EnumUtils.js";
import PathHelper from "../PathHelper.js";

export enum JobStateReason {
  JobCompletedSuccessfully = "JobCompletedSuccessfully",
  JobCanceledByUser = "JobCanceledByUser",
  JobScanning = "JobScanning",
}

export enum eSCLJobState {
  Processing = "Processing",
  Completed = "Completed",
  Canceled = "Canceled",
}

interface EsclJobInfoData {
  "pwg:JobUri": { "0": string };
  "pwg:JobUuid": { "0": string };
  "scan:Age": { "0": string };
  "pwg:ImagesCompleted": { "0": string };
  "pwg:ImagesToTransfer": { "0": string };
  "pwg:JobState": { "0": string };
  "pwg:JobStateReasons": {
    "0": {
      "pwg:JobStateReason": { "0": string };
    };
  };
}

export class EsclJobInfo {
  private readonly data: EsclJobInfoData;
  constructor(data: EsclJobInfoData) {
    this.data = data;
  }

  getJobUri(): string {
    return this.data["pwg:JobUri"]["0"];
  }

  getJobUuid(): string {
    return this.data["pwg:JobUuid"]["0"];
  }

  getAge(): string {
    return this.data["scan:Age"]["0"];
  }

  getJobState() {
    return EnumUtils.getState(
      "JobState",
      eSCLJobState,
      this.data["pwg:JobState"]["0"],
    );
  }

  getJobStateReason() {
    const jobStateReasons = this.data["pwg:JobStateReasons"]["0"];

    return EnumUtils.getState(
      "JobStateReason",
      JobStateReason,
      jobStateReasons["pwg:JobStateReason"]["0"],
    );
  }
}

export interface EsclScanStatusData {
  "scan:ScannerStatus": {
    "pwg:State": { "0": string };
    "scan:AdfState": { "0": string };
    "scan:Jobs"?: {
      "scan:JobInfo": EsclJobInfoData[];
    }[];
  };
}

export default class EsclScanStatus implements IScanStatus {
  private readonly data: EsclScanStatusData;

  constructor(data: EsclScanStatusData) {
    this.data = data;
  }

  static async createScanStatus(content: string): Promise<EsclScanStatus> {
    const parsed = await parseXmlString<EsclScanStatusData>(content);
    return new EsclScanStatus(parsed);
  }

  get scannerState(): ScannerState {
    const scannerStateStr = this.data["scan:ScannerStatus"]["pwg:State"]["0"];
    return EnumUtils.getState("ScannerState", ScannerState, scannerStateStr);
  }

  get adfState(): AdfState {
    if (
      Object.prototype.hasOwnProperty.call(
        this.data["scan:ScannerStatus"],
        "scan:AdfState",
      )
    ) {
      //not all printers have an automatic document feeder
      const adfState = this.data["scan:ScannerStatus"]["scan:AdfState"]["0"];

      // map value to the one of ScanStatus for commodity
      if (adfState === "ScannerAdfEmpty") {
        return AdfState.Empty;
      } else if (adfState === "ScannerAdfLoaded") {
        return AdfState.Loaded;
      } else {
        console.error(
          `"${adfState}" is not a know AdfState value, you would be kind as a reader of this message to fill an issue to help at better state handling.`,
        );
      }
      return adfState as AdfState;
    } else {
      return AdfState.Empty;
    }
  }

  isLoaded(): boolean {
    return this.adfState === AdfState.Loaded;
  }

  getInputSource(): InputSource {
    return this.isLoaded() ? InputSource.Adf : InputSource.Platen;
  }

  findJobByUri(jobLocation: string) {
    return this.getJobInfos().find(
      (x) =>
        jobLocation === PathHelper.getPathFromHttpLocation(x.getJobUri()) ||
        jobLocation === PathHelper.getPathFromHttpLocation(x.getJobUri()) + "/",
    );
  }

  public getJobInfos(): EsclJobInfo[] {
    const jobs = this.data["scan:ScannerStatus"]["scan:Jobs"];

    if (jobs === undefined || jobs.length === 0) {
      return [];
    }

    return jobs[0]["scan:JobInfo"].map((x) => new EsclJobInfo(x));
  }
}
