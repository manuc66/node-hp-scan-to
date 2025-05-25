import HPApi from "./HPApi";
import { DeviceCapabilities } from "./type/DeviceCapabilities";
import { waitForScanEventFromTarget } from "./listening";
import ScanJobSettings from "./hpModels/ScanJobSettings";
import { ScanContent, ScanPage } from "./type/ScanContent";
import Job from "./hpModels/Job";
import { delay } from "./delay";
import PathHelper from "./PathHelper";
import { InputSource } from "./type/InputSource";
import { SelectedScanTarget } from "./type/scanTargetDefinitions";
import fs from "fs/promises";
import JpegUtil from "./JpegUtil";
import { PageCountingStrategy } from "./type/pageCountingStrategy";

async function waitDeviceUntilItIsReadyToUploadOrCompleted(
  jobUrl: string,
): Promise<Job> {
  let job = null;
  let isReadyToUpload = false;
  do {
    job = await HPApi.getJob(jobUrl);
    if (job.jobState === "Canceled") {
      return job;
    } else if (
      job.pageState === "ReadyToUpload" ||
      job.jobState === "Completed"
    ) {
      isReadyToUpload = true;
    } else if (job.jobState == "Processing") {
      isReadyToUpload = false;
    } else {
      console.log(`Unknown jobState: ${job.jobState}`);
    }
    await delay(300);
  } while (!isReadyToUpload);
  return job;
}
async function scanProcessing(filePath: string): Promise<number | null> {
  const buffer: Buffer = await fs.readFile(filePath);

  const height = JpegUtil.fixSizeWithDNL(buffer);
  if (height != null) {
    // rewrite the fixed file
    await fs.writeFile(filePath, buffer);
    return height;
  }
  return null;
}

function createScanPage(
  job: Job,
  currentPageNumber: number,
  filePath: string,
  sizeFixed: number | null,
): ScanPage {
  const height = sizeFixed ?? job.imageHeight;
  return {
    path: filePath,
    pageNumber: currentPageNumber,
    width: job.imageWidth ?? 0,
    height: height ?? 0,
    xResolution: job.xResolution ?? 200,
    yResolution: job.yResolution ?? 200,
  };
}

async function handleScanProcessingState(
  job: Job,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  currentPageNumber: number,
  filePattern: string | undefined,
  date: Date,
): Promise<ScanPage | null> {
  if (
    job.pageState == "ReadyToUpload" &&
    job.binaryURL != null &&
    job.currentPageNumber != null
  ) {
    console.log(
      `Ready to download page job page ${job.currentPageNumber} at:`,
      job.binaryURL,
    );

    const destinationFilePath = PathHelper.getFileForPage(
      folder,
      scanCount,
      currentPageNumber,
      filePattern,
      "jpg",
      date,
    );
    const filePath = await HPApi.downloadPage(
      job.binaryURL,
      destinationFilePath,
    );
    console.log("Page downloaded to:", filePath);

    let sizeFixed: null | number = null;
    if (inputSource == InputSource.Adf) {
      sizeFixed = await scanProcessing(filePath);
      if (sizeFixed == null) {
        console.log(
          `File size has not been fixed, DNF may not have been found and approximate height is: ${job.imageHeight}`,
        );
      }
    }
    return createScanPage(job, currentPageNumber, filePath, sizeFixed);
  } else {
    console.log(`Unknown pageState: ${job.pageState}`);
    await delay(200);
    return null;
  }
}

export async function executeScanJob(
  scanJobSettings: ScanJobSettings,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  filePattern: string | undefined,
  pageCountingStrategy: PageCountingStrategy,
): Promise<"Completed" | "Canceled"> {
  const jobUrl = await HPApi.postJob(scanJobSettings);

  console.log(`Creating job with settings: ${JSON.stringify(scanJobSettings)}`);

  console.log("New job created:", jobUrl);

  let job = await HPApi.getJob(jobUrl);
  while (job.jobState !== "Completed") {
    job = await waitDeviceUntilItIsReadyToUploadOrCompleted(jobUrl);

    if (job.jobState == "Completed") {
      continue;
    }

    if (job.jobState === "Processing") {
      let pageNumber;
      if (pageCountingStrategy === PageCountingStrategy.Normal) {
        pageNumber = scanJobContent.elements.length + 1;
      } else if (pageCountingStrategy === PageCountingStrategy.OddOnly) {
        pageNumber = scanJobContent.elements.length * 2 + 1;
      } else if (pageCountingStrategy === PageCountingStrategy.EvenOnly) {
        pageNumber = (scanJobContent.elements.length + 1) * 2;
      } else {
        throw new Error(
          `Unknown page counting strategy: ${pageCountingStrategy}`,
        );
      }

      const page = await handleScanProcessingState(
        job,
        inputSource,
        folder,
        scanCount,
        pageNumber,
        filePattern,
        new Date(),
      );
      job = await HPApi.getJob(jobUrl);
      if (page != null && job.jobState != "Canceled") {
        scanJobContent.elements.push(page);
      }
    } else if (job.jobState === "Canceled") {
      console.log("Job cancelled by device");
      break;
    } else {
      console.log(`Unhandled jobState: ${job.jobState}`);
      await delay(200);
    }
  }
  console.log(
    `Job state: ${job.jobState}, totalPages: ${scanJobContent.elements.length}:`,
  );
  return job.jobState;
}

async function waitScanNewPageRequest(compEventURI: string): Promise<boolean> {
  let startNewScanJob = false;
  let wait = true;
  while (wait) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s

    const walkupScanToCompEvent =
      await HPApi.getWalkupScanToCompEvent(compEventURI);
    const message = walkupScanToCompEvent.eventType;

    if (message === "ScanNewPageRequested") {
      startNewScanJob = true;
      wait = false;
    } else if (message === "ScanPagesComplete") {
      wait = false;
    } else if (message === "ScanRequested") {
      // continue waiting
    } else {
      wait = false;
      console.log(`Unknown eventType: ${message}`);
    }
  }
  return startNewScanJob;
}

export async function executeScanJobs(
  scanJobSettings: ScanJobSettings,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  selectedScanTarget: SelectedScanTarget,
  deviceCapabilities: DeviceCapabilities,
  filePattern: string | undefined,
  pageCountingStrategy: PageCountingStrategy,
) {
  let jobState = await executeScanJob(
    scanJobSettings,
    inputSource,
    folder,
    scanCount,
    scanJobContent,
    filePattern,
    pageCountingStrategy,
  );
  const scanTarget = {
    resourceURI: selectedScanTarget.resourceURI,
    label: selectedScanTarget.label,
    isDuplexSingleSide: selectedScanTarget.isDuplexSingleSide,
  };
  let lastEvent = selectedScanTarget.event;
  if (
    jobState === "Completed" &&
    lastEvent.compEventURI &&
    inputSource !== InputSource.Adf &&
    lastEvent.destinationURI &&
    deviceCapabilities.supportsMultiItemScanFromPlaten
  ) {
    lastEvent = await waitForScanEventFromTarget(
      scanTarget,
      lastEvent.agingStamp,
    );
    if (!lastEvent.compEventURI) {
      return;
    }
    let startNewScanJob = await waitScanNewPageRequest(lastEvent.compEventURI);
    while (startNewScanJob) {
      jobState = await executeScanJob(
        scanJobSettings,
        inputSource,
        folder,
        scanCount,
        scanJobContent,
        filePattern,
        pageCountingStrategy,
      );
      if (jobState !== "Completed") {
        return;
      }
      if (!lastEvent.destinationURI) {
        break;
      }
      lastEvent = await waitForScanEventFromTarget(
        scanTarget,
        lastEvent.agingStamp,
      );
      if (!lastEvent.compEventURI) {
        return;
      }
      startNewScanJob = await waitScanNewPageRequest(lastEvent.compEventURI);
    }
  }
}
