import type DeviceClient from "../DeviceClient.js";
import type { ScanContent, ScanPage } from "../type/ScanContent.js";
import type { JobState } from "../hpModels/Job.js";
import PathHelper from "../PathHelper.js";
import { InputSource } from "../type/InputSource.js";
import fs from "node:fs/promises";
import JpegUtil from "../imageFormats/JpegUtil.js";
import { PageCountingStrategy } from "../type/pageCountingStrategy.js";
import type { IScanJobSettings } from "../hpModels/IScanJobSettings.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

export interface ScanJobContext {
  readonly api: DeviceClient;
  readonly scanJobSettings: IScanJobSettings;
  readonly inputSource: InputSource;
  readonly folder: string;
  readonly tempFolder: string;
  readonly scanCount: number;
  readonly scanJobContent: ScanContent;
  readonly filePattern: string | undefined;
  readonly pageCountingStrategy: PageCountingStrategy;
}

export interface DownloadedPage {
  readonly path: string;
  readonly contentType: string | undefined;
}

export interface PageDimensions {
  readonly width: number;
  readonly height: number;
  readonly xResolution: number;
  readonly yResolution: number;
}

function recordJob(scanJobContent: ScanContent, jobState: JobState): void {
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

function getPageNumber(
  pageCountingStrategy: PageCountingStrategy,
  scanJobContent: ScanContent,
): number {
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

async function fixJpegHeight(filePath: string): Promise<number | null> {
  const buffer: Buffer = await fs.readFile(filePath);

  const height = JpegUtil.fixSizeWithDNL(buffer);
  if (height !== null) {
    await fs.writeFile(filePath, buffer);
    return height;
  }
  return null;
}

async function getAndFixHeightWhenAdf(
  inputSource: InputSource,
  filePath: string,
  actualHeight: number,
): Promise<number | null> {
  if (inputSource !== InputSource.Adf) {
    return null;
  }

  const sizeFixed = await fixJpegHeight(filePath);
  if (sizeFixed === null) {
    logger.warn(
      `Image height has not been fixed, DNF may not have been found and approximate height is: ${actualHeight}`,
    );
    return null;
  }

  logger.debug(
    `Image height has been fixed to: ${sizeFixed} (contained in jpeg's DNL), scan job indicates: ${actualHeight}`,
  );
  return sizeFixed;
}

function buildScanPage(
  pageNumber: number,
  startedAt: number,
  path: string,
  dimensions: PageDimensions,
  contentType: string | undefined,
): ScanPage {
  const page: ScanPage = {
    path,
    pageNumber,
    width: dimensions.width,
    height: dimensions.height,
    xResolution: dimensions.xResolution,
    yResolution: dimensions.yResolution,
    capturedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
  if (contentType !== undefined) {
    page.contentType = contentType;
  }
  return page;
}

/**
 * Base class for the per-protocol scan job loops (HP LEDM and eSCL). It owns
 * the parts they share: page numbering, where the raw download goes, and
 * turning a downloaded file into a stored ScanPage (native JPEG or converted
 * to the requested format).
 */
export abstract class ScanJobHandler {
  constructor(protected readonly context: ScanJobContext) {}

  abstract handle(jobUrl: string): Promise<JobState>;

  protected nextPageNumber(): number {
    return getPageNumber(
      this.context.pageCountingStrategy,
      this.context.scanJobContent,
    );
  }

  /** JPEG pages are written to their final folder; other formats are first
   * downloaded raw to the temp folder before being converted. */
  protected async reserveDownloadPath(pageNumber: number): Promise<string> {
    const isJpeg = this.context.scanJobSettings.format.isJpeg();
    return PathHelper.getFileForPage(
      isJpeg ? this.context.folder : this.context.tempFolder,
      this.context.scanCount,
      pageNumber,
      this.context.filePattern,
      isJpeg ? "jpg" : "raw",
      new Date(),
    );
  }

  /** Remove a page file whose reservation was never turned into a real page. */
  protected async releaseReservedFile(filePath: string): Promise<void> {
    try {
      await fs.rm(filePath, { force: true });
    } catch (error) {
      logger.debug(
        { err: error },
        `Could not remove the reserved page file ${filePath}`,
      );
    }
  }

  protected async savePage(
    download: DownloadedPage,
    pageNumber: number,
    startedAt: number,
    dimensions: PageDimensions,
  ): Promise<ScanPage> {
    const { scanJobSettings, inputSource, folder, scanCount, filePattern } =
      this.context;

    if (scanJobSettings.format.isJpeg()) {
      const adfHeight = await getAndFixHeightWhenAdf(
        inputSource,
        download.path,
        dimensions.height,
      );
      return buildScanPage(
        pageNumber,
        startedAt,
        download.path,
        {
          ...dimensions,
          height: adfHeight ?? dimensions.height,
        },
        download.contentType,
      );
    }

    const destinationPath = await PathHelper.getFileForPage(
      folder,
      scanCount,
      pageNumber,
      filePattern,
      scanJobSettings.format.getExtension(),
      new Date(),
    );
    try {
      const savedImage = await scanJobSettings.format.save(
        download,
        dimensions.width,
        dimensions.height,
        dimensions.xResolution,
        scanJobSettings.mode,
        destinationPath,
      );
      return buildScanPage(
        pageNumber,
        startedAt,
        destinationPath,
        {
          width: savedImage.width,
          height: savedImage.height,
          xResolution: savedImage.xResolution,
          yResolution: savedImage.yResolution,
        },
        download.contentType,
      );
    } catch (error) {
      await this.releaseReservedFile(destinationPath);
      throw error;
    }
  }

  protected finish(jobState: JobState): JobState {
    recordJob(this.context.scanJobContent, jobState);
    return jobState;
  }
}
