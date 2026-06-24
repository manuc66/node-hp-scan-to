import type DeviceClient from "./DeviceClient.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import { waitForScanEventFromTarget } from "./listening.js";
import type { ScanContent, ScanPage } from "./type/ScanContent.js";
import type Job from "./hpModels/Job.js";
import { JobState, PageState } from "./hpModels/Job.js";
import { delay } from "./delay.js";
import PathHelper from "./PathHelper.js";
import { InputSource } from "./type/InputSource.js";
import type { SelectedScanTarget } from "./type/scanTargetDefinitions.js";
import fs from "fs/promises";
import JpegUtil from "./imageFormats/JpegUtil.js";
import { PageCountingStrategy } from "./type/pageCountingStrategy.js";
import type { IScanJobSettings } from "./hpModels/IScanJobSettings.js";
import { EventType } from "./hpModels/WalkupScanToCompEvent.js";
import { type EsclJobInfo, JobStateReason } from "./hpModels/EsclScanStatus.js";
import type EsclScanImageInfo from "./hpModels/EsclScanImageInfo.js";
import type { ImageFormat, JobDesc } from "./imageFormats/index.js";

async function waitDeviceUntilItIsReadyToUploadOrCompleted(
  api: DeviceClient,
  jobUrl: string,
): Promise<Job> {
  let job: null | Job;
  let isReadyToUpload;
  do {
    job = await api.getJob(jobUrl);
    if (job.jobState === JobState.Canceled) {
      return job;
    }
    isReadyToUpload =
      job.pageState === PageState.ReadyToUpload ||
      job.jobState === JobState.Completed;
    if (!isReadyToUpload) {
      await delay(300);
    }
  } while (!isReadyToUpload);
  return job;
}

async function fixJpegHeight(filePath: string): Promise<number | null> {
  const buffer: Buffer = await fs.readFile(filePath);

  const height = JpegUtil.fixSizeWithDNL(buffer);
  if (height !== null) {
    await fs.writeFile(filePath, buffer);
    return height;
  }
  return null;
}

async function handleNativeJpegFlow(
  api: DeviceClient,
  folder: string,
  scanCount: number,
  currentPageNumber: number,
  filePattern: string | undefined,
  date: Date,
  job: JobDesc,
  inputSource: InputSource,
) {
  const destinationFilePath: string = await PathHelper.getFileForPage(
    folder,
    scanCount,
    currentPageNumber,
    filePattern,
    "jpg",
    date,
  );
  console.log(
    `Downloading page ${job.currentPageNumber} → ${destinationFilePath}`,
  );

  await api.downloadPage(job.binaryURL, destinationFilePath);
  const adfHeight = await getAndFixHeightWHenAdf(
    api,
    inputSource,
    destinationFilePath,
    job.imageHeight,
  );
  const height = adfHeight ?? job.imageHeight;
  return {
    path: destinationFilePath,
    pageNumber: currentPageNumber,
    width: job.imageWidth,
    height: height,
    xResolution: job.xResolution,
    yResolution: job.yResolution,
  };
}

async function handleOtherFormatFlow(
  api: DeviceClient,
  tempFolder: string,
  scanCount: number,
  currentPageNumber: number,
  filePattern: string | undefined,
  date: Date,
  job: JobDesc,
  folder: string,
  targetImageFormat: ImageFormat,
  scanJobSettings: IScanJobSettings,
) {
  const tempDestinationFilePath = await PathHelper.getFileForPage(
    tempFolder,
    scanCount,
    currentPageNumber,
    filePattern,
    "raw",
    date,
  );

  console.log(
    `Downloading page ${job.currentPageNumber} → ${tempDestinationFilePath}`,
  );

  const downloadMeta = await api.downloadPageWithMeta(
    job.binaryURL,
    tempDestinationFilePath,
  );

  const destinationFilePath = await PathHelper.getFileForPage(
    folder,
    scanCount,
    currentPageNumber,
    filePattern,
    targetImageFormat.getExtension(),
    date,
  );

  const savedImage = await targetImageFormat.save(
    downloadMeta,
    job.imageWidth,
    job.imageHeight,
    job.xResolution,
    scanJobSettings.mode,
    destinationFilePath,
  );

  console.log("Page downloaded to:", destinationFilePath);
  return {
    path: destinationFilePath,
    pageNumber: currentPageNumber,
    width: savedImage.width,
    height: savedImage.height,
    xResolution: savedImage.xResolution,
    yResolution: savedImage.yResolution,
  };
}

export async function handleScanProcessingState(
  api: DeviceClient,
  job: Job,
  scanJobSettings: IScanJobSettings,
  inputSource: InputSource,
  folder: string,
  tempFolder: string,
  scanCount: number,
  currentPageNumber: number,
  filePattern: string | undefined,
  date: Date,
): Promise<ScanPage | null> {
  const targetImageFormat = scanJobSettings.format;
  if (
    job.pageState === PageState.ReadyToUpload &&
    job.binaryURL !== null &&
    job.currentPageNumber !== null
  ) {
    const jobDesc: JobDesc = {
      yResolution: job.yResolution ?? 200,
      xResolution: job.xResolution ?? 200,
      imageWidth: job.imageWidth ?? 0,
      imageHeight: job.imageHeight ?? 0,
      binaryURL: job.binaryURL,
      currentPageNumber: job.currentPageNumber,
    };

    if (targetImageFormat.isJpeg()) {
      return await handleNativeJpegFlow(
        api,
        folder,
        scanCount,
        currentPageNumber,
        filePattern,
        date,
        jobDesc,
        inputSource,
      );
    } else {
      return await handleOtherFormatFlow(
        api,
        tempFolder,
        scanCount,
        currentPageNumber,
        filePattern,
        date,
        jobDesc,
        folder,
        targetImageFormat,
        scanJobSettings,
      );
    }
  } else {
    console.log(`Unknown pageState: ${job.pageState}`);
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
  switch (pageCountingStrategy) {
    case PageCountingStrategy.Normal:
      return scanJobContent.elements.length + 1;
    case PageCountingStrategy.OddOnly:
      return scanJobContent.elements.length * 2 + 1;
    case PageCountingStrategy.EvenOnly:
      return (scanJobContent.elements.length + 1) * 2;
    default:
      throw new Error(
        `Unknown page counting strategy: ` +
          JSON.stringify(pageCountingStrategy),
      );
  }
}

async function hpScanJobHandling(
  api: DeviceClient,
  jobUrl: string,
  scanJobSettings: IScanJobSettings,
  pageCountingStrategy:
    | PageCountingStrategy
    | PageCountingStrategy.OddOnly
    | PageCountingStrategy.EvenOnly,
  scanJobContent: ScanContent,
  inputSource: InputSource,
  folder: string,
  tempFolder: string,
  scanCount: number,
  filePattern: string | undefined,
) {
  let job = await api.getJob(jobUrl);
  while (job.jobState !== JobState.Completed) {
    job = await waitDeviceUntilItIsReadyToUploadOrCompleted(api, jobUrl);

    if (job.jobState === JobState.Completed) {
      continue;
    }

    if (job.jobState === JobState.Processing) {
      const pageNumber = getPageNumber(pageCountingStrategy, scanJobContent);

      const page = await handleScanProcessingState(
        api,
        job,
        scanJobSettings,
        inputSource,
        folder,
        tempFolder,
        scanCount,
        pageNumber,
        filePattern,
        new Date(),
      );
      job = await api.getJob(jobUrl);
      if (page !== null && job.jobState !== JobState.Canceled) {
        scanJobContent.elements.push(page);
      }
    } else if (job.jobState === JobState.Blocked) {
      console.log("Job blocked, waiting for printer to complete");
      continue;
    } else {
      console.log("Job cancelled by device");
      break;
    }
  }
  console.log(
    `Job state: ${job.jobState} (${scanJobContent.elements.length} page(s))`,
  );
  return job.jobState;
}

function logJobInfo(
  jobUrl: string,
  scanImageInfo: EsclScanImageInfo,
  jobInfo: EsclJobInfo | undefined,
) {
  if (!jobUrl.includes(scanImageInfo.jobURI)) {
    console.log(
      `Incoherent state !!!! Job URI has changed: ${jobUrl} -> ${scanImageInfo.jobURI} -- crazy!`,
    );
  }

  console.log("From scanImageInfo:");
  console.log(`\tJob Uri: ${scanImageInfo.jobURI}`);
  console.log(`\tJob Uuid: ${scanImageInfo.jobUuid}`);

  console.log("From jobInfo:");
  console.log(`\tJob Uri: ${jobInfo?.getJobUri() ?? null}`);
  console.log(`\tJob Uuid: ${jobInfo?.getJobUuid() ?? null}`);
  console.log(`\tJob state reason: ${jobInfo?.getJobStateReason() ?? null}`);
  console.log(`\tJob state: ${jobInfo?.getJobState() ?? null}`);
}

function mapToJobState(jobStateReason: JobStateReason) {
  if (jobStateReason === JobStateReason.JobCanceledByUser) {
    return JobState.Canceled;
  }

  if (jobStateReason === JobStateReason.JobCompletedSuccessfully) {
    return JobState.Completed;
  }

  console.log(
    `Unknown job state reason: ${jobStateReason}, job will be cancelled`,
  );

  return JobState.Canceled;
}

async function getAndFixHeightWHenAdf(
  api: DeviceClient,
  inputSource: InputSource,
  filePath: string,
  actualHeight: number | null,
) {
  let sizeFixed: null | number = null;
  if (inputSource === InputSource.Adf) {
    sizeFixed = await fixJpegHeight(filePath);
    if (sizeFixed === null) {
      console.log(
        `Image height has not been fixed, DNF may not have been found and approximate height is: ${actualHeight}`,
      );
    } else {
      if (api.isDebug()) {
        console.log(
          `Image height has been fixed to: ${sizeFixed} (contained in jpeg's DNL), scan job indicates: ${actualHeight}`,
        );
      }
    }
  }
  return sizeFixed;
}

async function eSCLScanJobHandling(
  api: DeviceClient,
  jobUrl: string,
  scanJobSettings: IScanJobSettings,
  pageCountingStrategy:
    | PageCountingStrategy
    | PageCountingStrategy.OddOnly
    | PageCountingStrategy.EvenOnly,
  scanJobContent: ScanContent,
  inputSource: InputSource,
  folder: string,
  tempFolder: string,
  scanCount: number,
  filePattern: string | undefined,
) {
  const targetImageFormat = scanJobSettings.format;

  let jobStateReason: JobStateReason | null;
  let jobInfo: EsclJobInfo | undefined;
  do {
    await delay(1000);

    const currentPageNumber = getPageNumber(
      pageCountingStrategy,
      scanJobContent,
    );

    const jobLocation = PathHelper.getPathFromHttpLocation(jobUrl);
    if (targetImageFormat.isJpeg()) {
      const destinationFilePath = await PathHelper.getFileForPage(
        folder,
        scanCount,
        currentPageNumber,
        filePattern,
        "jpg",
        new Date(),
      );

      const jobLocation = PathHelper.getPathFromHttpLocation(jobUrl);

      const filePath = await api.downloadEsclPage(
        jobUrl,
        destinationFilePath,
      );

      const scanImageInfo = await api.getEsclScanImageInfo(jobLocation);
      console.log("scanImageInfo:", scanImageInfo.jobURI);

      const actualHeight = scanImageInfo.actualHeight;

      const adfHeight = await getAndFixHeightWHenAdf(
        api,
        inputSource,
        filePath.path,
        actualHeight,
      );

      console.log("Page downloaded to:", filePath);

      const page: ScanPage = {
        path: filePath.path,
        pageNumber: currentPageNumber,
        width: scanImageInfo.actualWidth,
        height: adfHeight ?? scanImageInfo.actualHeight,
        xResolution: scanJobSettings.xResolution,
        yResolution: scanJobSettings.yResolution,
      };

      scanJobContent.elements.push(page);

      if (api.isDebug()) {
        logJobInfo(jobUrl, scanImageInfo, jobInfo);
      }
    } else {
      const tempDestinationFilePath = await PathHelper.getFileForPage(
        tempFolder,
        scanCount,
        currentPageNumber,
        filePattern,
        "raw",
        new Date(),
      );

      console.log(
        `Downloading page ${currentPageNumber} → ${tempDestinationFilePath}`,
      );

      const downloadMeta = await api.downloadEsclPage(
        jobUrl,
        tempDestinationFilePath,
      );

      console.log("Page downloaded content-type:", downloadMeta.contentType);

      const scanImageInfo = await api.getEsclScanImageInfo(jobLocation);

      const width = scanImageInfo.actualWidth;
      const height = scanImageInfo.actualHeight;

      const destinationFilePath = await PathHelper.getFileForPage(
        folder,
        scanCount,
        currentPageNumber,
        filePattern,
        targetImageFormat.getExtension(),
        new Date(),
      );

      const savedImage = await targetImageFormat.save(
        downloadMeta,
        width,
        height,
        scanJobSettings.xResolution,
        scanJobSettings.mode,
        destinationFilePath,
      );

      console.log("Page downloaded to:", destinationFilePath);

      const page: ScanPage = {
        path: destinationFilePath,
        pageNumber: currentPageNumber,
        width: savedImage.width,
        height: savedImage.height,
        xResolution: savedImage.xResolution,
        yResolution: savedImage.yResolution,
      };

      scanJobContent.elements.push(page);

      if (api.isDebug()) {
        logJobInfo(jobUrl, scanImageInfo, jobInfo);
      }
    }
    const scannerStatus = await api.getEsclScanStatus();

    jobInfo = scannerStatus.findJobByUri(jobLocation);

    jobStateReason = jobInfo?.getJobStateReason() ?? null;
  } while (
    jobStateReason !== null &&
    jobStateReason !== JobStateReason.JobCompletedSuccessfully &&
    jobStateReason !== JobStateReason.JobCanceledByUser
  );

  if (jobStateReason === null) {
    console.log(
      "Job state reason is null, it means that the current " +
        "job was not found in the device's status, this is probably a bug " +
        "in the device, the current scan will be marked as cancelled",
    );
    return JobState.Canceled;
  }

  return mapToJobState(jobStateReason);
}

export async function executeScanJob(
  api: DeviceClient,
  scanJobSettings: IScanJobSettings,
  inputSource: InputSource,
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  filePattern: string | undefined,
  pageCountingStrategy: PageCountingStrategy,
  deviceCapabilities: DeviceCapabilities,
): Promise<JobState> {
  const jobUrl = await deviceCapabilities.submitScanJob(scanJobSettings);

  console.log(`Creating job with settings: ${JSON.stringify(scanJobSettings)}`);

  console.log("New job created:", jobUrl);

  let jobState: JobState;
  if (deviceCapabilities.isEscl) {
    jobState = await eSCLScanJobHandling(
      api,
      jobUrl,
      scanJobSettings,
      pageCountingStrategy,
      scanJobContent,
      inputSource,
      folder,
      tempFolder,
      scanCount,
      filePattern,
    );
  } else {
    jobState = await hpScanJobHandling(
      api,
      jobUrl,
      scanJobSettings,
      pageCountingStrategy,
      scanJobContent,
      inputSource,
      folder,
      tempFolder,
      scanCount,
      filePattern,
    );
  }
  return jobState;
}

async function waitScanNewPageRequest(
  api: DeviceClient,
  compEventURI: string,
  userActionTimeout: number | null = null,
): Promise<boolean> {
  let startNewScanJob = false;
  let wait = true;
  const waitMax = userActionTimeout ?? 50;
  let i = 0;
  while (wait && i < waitMax) {
    i++;
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const walkupScanToCompEvent =
      await api.getWalkupScanToCompEvent(compEventURI);
    const eventType = walkupScanToCompEvent.eventType;
    const eventTypeStr = eventType.toString();
    if (eventType === EventType.ScanNewPageRequested) {
      startNewScanJob = true;
      wait = false;
    } else if (eventType === EventType.ScanPagesComplete) {
      wait = false;
    } else if (eventType === EventType.ScanRequested) {
      console.log(`Waiting for user input (attempt ${i} of ${waitMax})`);
    } else {
      wait = false;
      console.log(`Unknown eventType: ${eventTypeStr}`);
    }
  }
  return startNewScanJob;
}

export async function executeScanJobs(
  api: DeviceClient,
  scanJobSettings: IScanJobSettings,
  inputSource: InputSource,
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  selectedScanTarget: SelectedScanTarget,
  deviceCapabilities: DeviceCapabilities,
  filePattern: string | undefined,
  pageCountingStrategy: PageCountingStrategy,
): Promise<void> {
  let jobState = await executeScanJob(
    api,
    scanJobSettings,
    inputSource,
    folder,
    tempFolder,
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
    lastEvent.compEventURI !== undefined &&
    inputSource !== InputSource.Adf &&
    lastEvent.destinationURI !== undefined &&
    deviceCapabilities.supportsMultiItemScanFromPlaten
  ) {
    const nextEvent = await waitForScanEventFromTarget(
      api,
      scanTarget,
      lastEvent.agingStamp,
    );
    if (nextEvent === undefined) {
      return;
    }
    lastEvent = nextEvent;
    if (lastEvent.compEventURI === undefined) {
      return;
    }
    let startNewScanJob = await waitScanNewPageRequest(
      api,
      lastEvent.compEventURI,
      deviceCapabilities.userActionTimeout,
    );
    while (startNewScanJob) {
      jobState = await executeScanJob(
        api,
        scanJobSettings,
        inputSource,
        folder,
        tempFolder,
        scanCount,
        scanJobContent,
        filePattern,
        pageCountingStrategy,
        deviceCapabilities,
      );
      if (jobState !== JobState.Completed) {
        return;
      }
      if (lastEvent.destinationURI === undefined) {
        break;
      }
      const nextEvent = await waitForScanEventFromTarget(
        api,
        scanTarget,
        lastEvent.agingStamp,
      );
      if (nextEvent === undefined) {
        return;
      }
      lastEvent = nextEvent;
      if (lastEvent.compEventURI === undefined) {
        return;
      }
      startNewScanJob = await waitScanNewPageRequest(
        api,
        lastEvent.compEventURI,
        deviceCapabilities.userActionTimeout,
      );
    }
  }
}
