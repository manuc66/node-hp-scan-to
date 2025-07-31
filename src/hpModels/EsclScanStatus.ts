"use strict";
import { InputSource } from "../type/InputSource";
import { parseXmlString } from "./ParseXmlString";
import { IScanStatus } from "./IScanStatus";
import { ScannerState } from "./ScannerState";
import { AdfState } from "./AdfState";
import { EnumUtils } from "./EnumUtils";

export enum JobStateReason {
  JobCompletedSuccessfully = "JobCompletedSuccessfully",
  JobScanning="JobScanning",
}

export enum eSCLJobState {
  Processing = "Processing",
  Completed = "Completed",
}

export interface EsclScanStatusData {
  "scan:ScannerStatus": {
    "pwg:State": { "0": string };
    "scan:AdfState": { "0": string };
    "scan:Jobs"?: {
        "scan:JobInfo": {
          "pwg:JobUri": { "0": string };
          "pwg:JobUuid": { "0": string };
          "pwg:ImagesCompleted": { "0": string };
          "pwg:ImagesToTransfer": { "0": string };
          "pwg:JobState": { "0": string };
          "pwg:JobStateReasons": {
            "0": {
                "pwg:JobStateReason": { "0": string };
              };
          };
        }[];
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

  getJobState (jobUri: string) : eSCLJobState | null {
    const jobInfo = this.getJobInfo(jobUri);

    if (jobInfo === undefined) {
      return null;
    }


    return EnumUtils.getState("JobState", eSCLJobState, jobInfo["pwg:JobState"]["0"]);
  }

  getJobStateReason(jobUri: string) : JobStateReason | null {
    const jobInfo = this.getJobInfo(jobUri);

    if (jobInfo === undefined) {
      return null;
    }

    const jobStateReasons = jobInfo["pwg:JobStateReasons"]["0"];

    return EnumUtils.getState("JobStateReason", JobStateReason, jobStateReasons["pwg:JobStateReason"]["0"]);
  }

  private getJobInfo(jobUri: string) {
    const jobs = this.data["scan:ScannerStatus"]["scan:Jobs"];

    if (jobs === undefined) {
      return undefined;
    }

    const jobInfos = jobs[0]["scan:JobInfo"];

    return jobInfos.find((x) => x["pwg:JobUri"]["0"] === jobUri);
  }
}
