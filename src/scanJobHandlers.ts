import HPApi from "./HPApi";
import { DeviceCapabilities } from "./type/DeviceCapabilities";
import { waitForScanEventFromTarget } from "./listening";
import { ScanContent, ScanPage } from "./type/ScanContent";
import Job, { JobState, PageState } from "./hpModels/Job";
import { delay } from "./delay";
import PathHelper from "./PathHelper";
import { InputSource } from "./type/InputSource";
import { SelectedScanTarget } from "./type/scanTargetDefinitions";
import fs from "fs/promises";
import JpegUtil from "./JpegUtil";
import { PageCountingStrategy } from "./type/pageCountingStrategy";
import { IScanJobSettings } from "./hpModels/IScanJobSettings";
import { EventType } from "./hpModels/WalkupScanToCompEvent";
import { EsclJobInfo, JobStateReason } from "./hpModels/EsclScanStatus";
import EsclScanImageInfo from "./hpModels/EsclScanImageInfo";
import { getLoggerForFile } from "./logger";

const logger = getLoggerForFile(__filename);

async function waitDeviceUntilItIsReadyToUploadOrCompleted(
  jobUrl: string,
): Promise<Job> {
  let job = null;
  let isReadyToUpload = false;
  do {
    job = await HPApi.getJob(jobUrl);
    const jobStateStr = job.jobState.toString();
    if (job.jobState === JobState.Canceled) {
      return job;
    } else if (
      job.pageState === PageState.ReadyToUpload ||
      job.jobState === JobState.Completed
    ) {
      isReadyToUpload = true;
    } else if (job.jobState == JobState.Processing) {
      isReadyToUpload = false;
    } else {
      logger.warn(`Unknown jobState: ${jobStateStr}`);
    }
    await delay(300);
  } while (!isReadyToUpload);
  return job;
}

async function fixJpegHeight(filePath: string): Promise<number | null> {
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
    job.pageState == PageState.ReadyToUpload &&
    job.binaryURL != null &&
    job.currentPageNumber != null
  ) {
    const destinationFilePath = await PathHelper.getFileForPage(
      folder,
      scanCount,
      currentPageNumber,
      filePattern,
      "jpg",
      date,
    );

    logger.info(
      `Downloading page ${job.currentPageNumber} → ${destinationFilePath}`,
    );
    const filePath = await HPApi.downloadPage(
      job.binaryURL,
      destinationFilePath,
    );

    const adfHeight = await getAndFixHeightWHenAdf(
      inputSource,
      filePath,
      job.imageHeight,
    );
    return createScanPage(job, currentPageNumber, filePath, adfHeight);
  } else {
    logger.warn(`Unknown pageState: ${job.pageState}`);
    await delay(200);
    return null;
  }
}

function getPageNumber(
  pageCountingStrategy:
    | PageCountingStrategy
    | PageCountingStrategy.OddOnly
    | PageCountingStrategy.EvenOnly,
  scanJobContent: ScanContent,
) {
  if (pageCountingStrategy === PageCountingStrategy.Normal) {
    return scanJobContent.elements.length + 1;
  } else if (pageCountingStrategy === PageCountingStrategy.OddOnly) {
    return scanJobContent.elements.length * 2 + 1;
  } else if (pageCountingStrategy === PageCountingStrategy.EvenOnly) {
    return (scanJobContent.elements.length + 1) * 2;
  } else {
    throw new Error(
      `Unknown page counting strategy: ${JSON.stringify(pageCountingStrategy)}`,
    );
  }
}

async function hpScanJobHandling(
  jobUrl: string,
  pageCountingStrategy:
    | PageCountingStrategy
    | PageCountingStrategy.OddOnly
    | PageCountingStrategy.EvenOnly,
  scanJobContent: ScanContent,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  filePattern: string | undefined,
) {
  let job = await HPApi.getJob(jobUrl);
  while (job.jobState !== JobState.Completed) {
    job = await waitDeviceUntilItIsReadyToUploadOrCompleted(jobUrl);

    if (job.jobState == JobState.Completed) {
      continue;
    }

    const jobStateStr = job.jobState.toString();
    if (job.jobState === JobState.Processing) {
      const pageNumber = getPageNumber(pageCountingStrategy, scanJobContent);

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
      if (page != null && job.jobState != JobState.Canceled) {
        scanJobContent.elements.push(page);
      }
    } else if (job.jobState === JobState.Canceled) {
      logger.info("Job cancelled by device");
      break;
    } else {
      logger.info(`Unhandled jobState: ${jobStateStr}`);
      await delay(200);
    }
  }
  logger.info(
    `Job state: ${job.jobState} (${scanJobContent.elements.length} page(s))`,
  );
  return job.jobState;
}

function logJobInfo(
  jobUrl: string,
  scanImageInfo: EsclScanImageInfo,
  jobInfo: EsclJobInfo | undefined,
) {
  if (jobUrl.indexOf(scanImageInfo.jobURI) == -1) {
    // for an unknown reason this happens on an HP Smart Tank Plus 570!
    logger.debug(
      `Incoherent state !!!! Job URI has changed: ${jobUrl} -> ${scanImageInfo.jobURI} -- crazy!`,
    );
  }

  logger.debug("From scanImageInfo:");
  logger.debug(`\tJob Uri: ${scanImageInfo?.jobURI ?? null}`);
  logger.debug(`\tJob Uuid: ${scanImageInfo?.jobUuid ?? null}`);

  logger.debug("From jobInfo:");
  logger.debug(`\tJob Uri: ${jobInfo?.getJobUri() ?? null}`);
  logger.debug(`\tJob Uuid: ${jobInfo?.getJobUuid() ?? null}`);
  logger.debug(`\tJob state reason: ${jobInfo?.getJobStateReason() ?? null}`);
  logger.debug(`\tJob state: ${jobInfo?.getJobState() ?? null}`);
}

function mapToJobState(jobStateReason: JobStateReason) {
  if (jobStateReason === JobStateReason.JobCanceledByUser) {
    return JobState.Canceled;
  }

  if (jobStateReason === JobStateReason.JobCompletedSuccessfully) {
    return JobState.Completed;
  }

  logger.warn(
    `Unknown job state reason: ${jobStateReason}, job will be cancelled`,
  );

  return JobState.Canceled;
}

async function getAndFixHeightWHenAdf(
  inputSource: InputSource,
  filePath: string,
  actualHeight: number | null,
) {
  let sizeFixed: null | number = null;
  if (inputSource == InputSource.Adf) {
    sizeFixed = await fixJpegHeight(filePath);
    if (sizeFixed == null) {
      logger.warn(
        `Image height has not been fixed, DNF may not have been found and approximate height is: ${actualHeight}`,
      );
    } else {
      logger.debug(
        `Image height has been fixed to: ${sizeFixed} (contained in jpeg's DNL), scan job indicates: ${actualHeight}`,
      );
    }
  }
  return sizeFixed;
}

async function eSCLScanJobHandling(
  jobUrl: string,
  scanJobSettings: IScanJobSettings,
  pageCountingStrategy:
    | PageCountingStrategy
    | PageCountingStrategy.OddOnly
    | PageCountingStrategy.EvenOnly,
  scanJobContent: ScanContent,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  filePattern: string | undefined,
) {
  let jobStateReason: JobStateReason | null = null;
  let jobInfo: EsclJobInfo | undefined = undefined;
  do {
    await delay(1000);

    const pageNumber = getPageNumber(pageCountingStrategy, scanJobContent);

    const destinationFilePath = await PathHelper.getFileForPage(
      folder,
      scanCount,
      pageNumber,
      filePattern,
      "jpg",
      new Date(),
    );

    const jobLocation = PathHelper.getPathFromHttpLocation(jobUrl);

    const filePath = await HPApi.downloadEsclPage(jobUrl, destinationFilePath);

    const scanImageInfo = await HPApi.getEsclScanImageInfo(jobLocation);
    logger.info(`scanImageInfo: ${scanImageInfo.jobURI}`);

    const actualHeight = scanImageInfo.actualHeight;

    const adfHeight = await getAndFixHeightWHenAdf(
      inputSource,
      filePath,
      actualHeight,
    );

    const scannerStatus = await HPApi.getEsclScanStatus();

    logger.info(`Page downloaded to: ${filePath}`);

    const page: ScanPage = {
      path: filePath,
      pageNumber,
      width: scanImageInfo.actualWidth,
      height: adfHeight ?? scanImageInfo.actualHeight,
      xResolution: scanJobSettings.xResolution,
      yResolution: scanJobSettings.yResolution,
    };

    scanJobContent.elements.push(page);

    jobInfo = scannerStatus.findJobByUri(jobLocation);

    logJobInfo(jobUrl, scanImageInfo, jobInfo);

    jobStateReason = jobInfo?.getJobStateReason() ?? null;
  } while (
    jobStateReason !== null &&
    jobStateReason !== JobStateReason.JobCompletedSuccessfully &&
    jobStateReason != JobStateReason.JobCanceledByUser
  );

  if (jobStateReason == null) {
    logger.warn(
      "Job state reason is null, it means that the current " +
        "job was not found in the device's status, this is probably a bug " +
        "in the device, the current scan will be marked as cancelled",
    );
    return JobState.Canceled;
  }

  return mapToJobState(jobStateReason);
}

export async function executeScanJob(
  scanJobSettings: IScanJobSettings,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  filePattern: string | undefined,
  pageCountingStrategy: PageCountingStrategy,
  deviceCapabilities: DeviceCapabilities,
): Promise<JobState> {
  const jobUrl = await deviceCapabilities.submitScanJob(scanJobSettings);

  logger.info(`Creating job with settings: ${JSON.stringify(scanJobSettings)}`);

  logger.info(`New job created: ${jobUrl}`);

  let jobState: JobState;
  if (deviceCapabilities.isEscl) {
    jobState = await eSCLScanJobHandling(
      jobUrl,
      scanJobSettings,
      pageCountingStrategy,
      scanJobContent,
      inputSource,
      folder,
      scanCount,
      filePattern,
    );
  } else {
    jobState = await hpScanJobHandling(
      jobUrl,
      pageCountingStrategy,
      scanJobContent,
      inputSource,
      folder,
      scanCount,
      filePattern,
    );
  }
  return jobState;
}

async function waitScanNewPageRequest(compEventURI: string): Promise<boolean> {
  let startNewScanJob = false;
  let wait = true;
  while (wait) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s

    const walkupScanToCompEvent =
      await HPApi.getWalkupScanToCompEvent(compEventURI);
    const eventType = walkupScanToCompEvent.eventType;
    const eventTypeStr = eventType.toString();
    if (eventType === EventType.ScanNewPageRequested) {
      startNewScanJob = true;
      wait = false;
    } else if (eventType === EventType.ScanPagesComplete) {
      wait = false;
    } else if (eventType === EventType.ScanRequested) {
      // continue waiting
    } else {
      wait = false;
      logger.warn(`Unknown eventType: ${eventTypeStr}`);
    }
  }
  return startNewScanJob;
}

export async function executeScanJobs(
  scanJobSettings: IScanJobSettings,
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
    deviceCapabilities,
  );
  const scanTarget = {
    resourceURI: selectedScanTarget.resourceURI,
    label: selectedScanTarget.label,
    isDuplexSingleSide: selectedScanTarget.isDuplexSingleSide,
  };
  let lastEvent = selectedScanTarget.event;
  if (
    jobState === JobState.Completed &&
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
        deviceCapabilities,
      );
      if (jobState !== JobState.Completed) {
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
