import type DeviceClient from "./DeviceClient.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import type { ScanListener } from "./scanListeners/ScanListener.js";
import type { ScanContent, ScanPage } from "./type/ScanContent.js";
import type Job from "./hpModels/Job.js";
import { JobState, PageState } from "./hpModels/Job.js";
import { delay } from "./delay.js";
import PathHelper from "./PathHelper.js";
import { InputSource } from "./type/InputSource.js";
import fs from "node:fs/promises";
import JpegUtil from "./imageFormats/JpegUtil.js";
import { PageCountingStrategy } from "./type/pageCountingStrategy.js";
import type { IScanJobSettings } from "./hpModels/IScanJobSettings.js";
import { type EsclJobInfo, eSCLJobState } from "./hpModels/EsclScanStatus.js";
import type EsclScanImageInfo from "./hpModels/EsclScanImageInfo.js";
import type { ImageFormat, JobDesc } from "./imageFormats/index.js";
import { getLoggerForFile } from "./logger.js";
import { AxiosError } from "axios";

const logger = getLoggerForFile(import.meta.url);

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

function recordJob(
  scanJobContent: ScanContent,
  jobState: JobState,
): void {
  if (scanJobContent.meta === undefined) {
    return;
  }
  const job = (scanJobContent.meta.job ??= {
    state: jobState,
    count: 0,
  });
  job.state = jobState;
  job.count += 1;
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
  const pageStartedAt = Date.now();
  const destinationFilePath: string = await PathHelper.getFileForPage(
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

  const downloadMeta = await api.downloadPageWithMeta(
    job.binaryURL,
    destinationFilePath,
  );
  const adfHeight = await getAndFixHeightWHenAdf(
    inputSource,
    destinationFilePath,
    job.imageHeight,
  );
  const height = adfHeight ?? job.imageHeight;
  const page: ScanPage = {
    path: destinationFilePath,
    pageNumber: currentPageNumber,
    width: job.imageWidth,
    height: height,
    xResolution: job.xResolution,
    yResolution: job.yResolution,
    capturedAt: new Date().toISOString(),
    durationMs: Date.now() - pageStartedAt,
  };
  if (downloadMeta.contentType !== undefined) {
    page.contentType = downloadMeta.contentType;
  }
  return page;
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
  const pageStartedAt = Date.now();
  const tempDestinationFilePath = await PathHelper.getFileForPage(
    tempFolder,
    scanCount,
    currentPageNumber,
    filePattern,
    "raw",
    date,
  );

  logger.info(
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

  logger.info(`Page downloaded to: ${destinationFilePath}`);
  const page: ScanPage = {
    path: destinationFilePath,
    pageNumber: currentPageNumber,
    width: savedImage.width,
    height: savedImage.height,
    xResolution: savedImage.xResolution,
    yResolution: savedImage.yResolution,
    capturedAt: new Date().toISOString(),
    durationMs: Date.now() - pageStartedAt,
  };
  if (downloadMeta.contentType !== undefined) {
    page.contentType = downloadMeta.contentType;
  }
  return page;
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
  switch (pageCountingStrategy) {
    case PageCountingStrategy.Normal:
      return scanJobContent.elements.length + 1;
    case PageCountingStrategy.OddOnly:
      return scanJobContent.elements.length * 2 + 1;
    case PageCountingStrategy.EvenOnly:
      return (scanJobContent.elements.length + 1) * 2;
    default:
      throw new Error(
        `Unknown page counting strategy: ${JSON.stringify(pageCountingStrategy)}`,
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
      logger.info("Job blocked, waiting for printer to complete");
      continue;
    } else {
      logger.info("Job cancelled by device");
      break;
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
  if (!jobUrl.includes(scanImageInfo.jobURI)) {
    logger.debug(
      `Incoherent state !!!! Job URI has changed: ${jobUrl} -> ${scanImageInfo.jobURI} -- crazy!`,
    );
  }

  logger.debug("From scanImageInfo:");
  logger.debug(`\tJob Uri: ${scanImageInfo.jobURI}`);
  logger.debug(`\tJob Uuid: ${scanImageInfo.jobUuid}`);

  logger.debug("From jobInfo:");
  logger.debug(`\tJob Uri: ${jobInfo?.getJobUri() ?? null}`);
  logger.debug(`\tJob Uuid: ${jobInfo?.getJobUuid() ?? null}`);
  logger.debug(`\tJob state: ${jobInfo?.getJobState() ?? null}`);
}

async function getAndFixHeightWHenAdf(
  inputSource: InputSource,
  filePath: string,
  actualHeight: number | null,
) {
  let sizeFixed: null | number = null;
  if (inputSource === InputSource.Adf) {
    sizeFixed = await fixJpegHeight(filePath);
    if (sizeFixed === null) {
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

interface DownloadedPage {
  readonly path: string;
  readonly contentType: string | undefined;
}

/**
 * Fetch the next page from an eSCL job. A 404 from /NextDocument is the
 * device's end-of-job signal: every image has been handed over and there is
 * nothing left to fetch (some firmwares keep reporting the job as
 * Processing/JobScanning while /NextDocument already answers 404). Returns
 * null in that case so the caller can end the loop gracefully; any other
 * failure is rethrown.
 */
async function downloadNextDocumentOrEnd(
  api: DeviceClient,
  jobUrl: string,
  destinationFilePath: string,
): Promise<DownloadedPage | null> {
  try {
    return await api.downloadEsclPage(jobUrl, destinationFilePath);
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      logger.info(
        "No further image available from /NextDocument (404); treating the job as completed.",
      );
      return null;
    }
    throw error;
  }
}

interface EsclJobContext {
  readonly api: DeviceClient;
  readonly jobUrl: string;
  readonly jobLocation: string;
  readonly scanJobSettings: IScanJobSettings;
  readonly inputSource: InputSource;
  readonly folder: string;
  readonly tempFolder: string;
  readonly scanCount: number;
  readonly filePattern: string | undefined;
}

type EsclJobPollResult =
  | { readonly kind: "running"; readonly jobInfo: EsclJobInfo }
  | { readonly kind: "canceled" }
  | { readonly kind: "gone" };

/**
 * Read the device status for the job. The state is only used to stop on an
 * explicit cancellation: completion is driven by the /NextDocument 404, which
 * also covers firmwares that keep reporting Processing/JobScanning after the
 * last page.
 */
async function pollEsclJob(
  context: EsclJobContext,
): Promise<EsclJobPollResult> {
  const scannerStatus = await context.api.getEsclScanStatus(context.jobUrl);
  const jobInfo = scannerStatus.findJobByUri(context.jobLocation);
  if (jobInfo === undefined) {
    return { kind: "gone" };
  }

  const jobState = jobInfo.getJobState();
  if (jobState === eSCLJobState.Canceled || jobState === eSCLJobState.Aborted) {
    logger.info(`Job ${jobState.toLowerCase()}; ending the scan.`);
    return { kind: "canceled" };
  }

  return { kind: "running", jobInfo };
}

interface PageDimensions {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly xResolution: number;
  readonly yResolution: number;
  readonly contentType?: string | undefined;
}

function buildScanPage(
  pageNumber: number,
  startedAt: number,
  dimensions: PageDimensions,
): ScanPage {
  const page: ScanPage = {
    path: dimensions.path,
    pageNumber,
    width: dimensions.width,
    height: dimensions.height,
    xResolution: dimensions.xResolution,
    yResolution: dimensions.yResolution,
    capturedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
  if (dimensions.contentType !== undefined) {
    page.contentType = dimensions.contentType;
  }
  return page;
}

async function storeNativeJpegPage(
  context: EsclJobContext,
  download: DownloadedPage,
  scanImageInfo: EsclScanImageInfo,
  pageNumber: number,
  startedAt: number,
): Promise<ScanPage> {
  const adfHeight = await getAndFixHeightWHenAdf(
    context.inputSource,
    download.path,
    scanImageInfo.actualHeight,
  );

  logger.info(download, "Page downloaded to");

  return buildScanPage(pageNumber, startedAt, {
    path: download.path,
    width: scanImageInfo.actualWidth,
    height: adfHeight ?? scanImageInfo.actualHeight,
    xResolution: context.scanJobSettings.xResolution,
    yResolution: context.scanJobSettings.yResolution,
    contentType: download.contentType,
  });
}

async function storeConvertedPage(
  context: EsclJobContext,
  download: DownloadedPage,
  scanImageInfo: EsclScanImageInfo,
  pageNumber: number,
  startedAt: number,
): Promise<ScanPage> {
  const format = context.scanJobSettings.format;

  logger.info(`Page downloaded content-type: ${download.contentType}`);

  const destinationImagePath = await PathHelper.getFileForPage(
    context.folder,
    context.scanCount,
    pageNumber,
    context.filePattern,
    format.getExtension(),
    new Date(),
  );

  const savedImage = await format.save(
    download,
    scanImageInfo.actualWidth,
    scanImageInfo.actualHeight,
    context.scanJobSettings.xResolution,
    context.scanJobSettings.mode,
    destinationImagePath,
  );

  logger.info(`Page downloaded to: ${destinationImagePath}`);

  return buildScanPage(pageNumber, startedAt, {
    path: destinationImagePath,
    width: savedImage.width,
    height: savedImage.height,
    xResolution: savedImage.xResolution,
    yResolution: savedImage.yResolution,
    contentType: download.contentType,
  });
}

interface RetrievedPage {
  readonly page: ScanPage;
  readonly scanImageInfo: EsclScanImageInfo;
}

/**
 * Retrieve and store the next page. Returns null when /NextDocument answers
 * 404, i.e. when every image has been handed over.
 */
async function retrieveNextPage(
  context: EsclJobContext,
  pageNumber: number,
): Promise<RetrievedPage | null> {
  const isJpeg = context.scanJobSettings.format.isJpeg();
  const startedAt = Date.now();

  const destinationFilePath = await PathHelper.getFileForPage(
    isJpeg ? context.folder : context.tempFolder,
    context.scanCount,
    pageNumber,
    context.filePattern,
    isJpeg ? "jpg" : "raw",
    new Date(),
  );

  const download = await downloadNextDocumentOrEnd(
    context.api,
    context.jobUrl,
    destinationFilePath,
  );
  if (download === null) {
    return null;
  }

  const scanImageInfo = await context.api.getEsclScanImageInfo(
    context.jobLocation,
  );
  const page = isJpeg
    ? await storeNativeJpegPage(
        context,
        download,
        scanImageInfo,
        pageNumber,
        startedAt,
      )
    : await storeConvertedPage(
        context,
        download,
        scanImageInfo,
        pageNumber,
        startedAt,
      );

  return { page, scanImageInfo };
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
): Promise<JobState> {
  const context: EsclJobContext = {
    api,
    jobUrl,
    jobLocation: PathHelper.getPathFromHttpLocation(jobUrl),
    scanJobSettings,
    inputSource,
    folder,
    tempFolder,
    scanCount,
    filePattern,
  };

  while (true) {
    await delay(1000);

    const poll = await pollEsclJob(context);
    if (poll.kind === "gone") {
      logger.warn(
        "The device no longer reports this job in its scanner status; marking the scan as canceled.",
      );
      recordJob(scanJobContent, JobState.Canceled);
      return JobState.Canceled;
    }
    if (poll.kind === "canceled") {
      recordJob(scanJobContent, JobState.Canceled);
      return JobState.Canceled;
    }

    const pageNumber = getPageNumber(pageCountingStrategy, scanJobContent);
    const retrieved = await retrieveNextPage(context, pageNumber);
    if (retrieved === null) {
      // Every image has been handed over: this is the end of the transfer.
      recordJob(scanJobContent, JobState.Completed);
      return JobState.Completed;
    }

    scanJobContent.elements.push(retrieved.page);
    logJobInfo(jobUrl, retrieved.scanImageInfo, poll.jobInfo);
  }
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

  // Build a clean summary: the settings instance exposes private fields
  // (e.g. `_format`) that are not useful in logs.
  const rawSettings = scanJobSettings as unknown as {
    inputSource: string;
    contentType: string;
    resolution: number;
    width: number | null;
    height: number | null;
    isDuplex: boolean;
  };
  logger.info(
    {
      inputSource: rawSettings.inputSource,
      contentType: rawSettings.contentType,
      resolution: rawSettings.resolution,
      mode: scanJobSettings.mode,
      format: scanJobSettings.format.getExtension(),
      width: rawSettings.width,
      height: rawSettings.height,
      isDuplex: rawSettings.isDuplex,
    },
    "Creating job with settings",
  );

  logger.info(`New job created: ${jobUrl}`);

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
    recordJob(scanJobContent, jobState);
  }
  return jobState;
}

export async function executeScanJobs(
  api: DeviceClient,
  scanJobSettings: IScanJobSettings,
  inputSource: InputSource,
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  deviceCapabilities: DeviceCapabilities,
  scanListener: ScanListener,
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

  if (
    jobState !== JobState.Completed ||
    inputSource === InputSource.Adf ||
    !deviceCapabilities.supportsMultiItemScanFromPlaten
  ) {
    return;
  }

  let nextPage = await scanListener.waitForNextPage();
  while (nextPage !== null) {
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
    nextPage = await scanListener.waitForNextPage();
  }
}
