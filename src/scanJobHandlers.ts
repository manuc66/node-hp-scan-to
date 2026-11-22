import type DeviceClient from "./DeviceClient.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import type { ScanListener } from "./scanListeners/ScanListener.js";
import type { ScanContent } from "./type/ScanContent.js";
import { JobState } from "./hpModels/Job.js";
import { PageCountingStrategy } from "./type/pageCountingStrategy.js";
import type { IScanJobSettings } from "./hpModels/IScanJobSettings.js";
import { InputSource } from "./type/InputSource.js";
import { getLoggerForFile } from "./logger.js";
import { createScanJobHandler } from "./scanJobs/createScanJobHandler.js";
import type { ScanJobContext } from "./scanJobs/ScanJobHandler.js";

const logger = getLoggerForFile(import.meta.url);

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

  const context: ScanJobContext = {
    api,
    scanJobSettings,
    inputSource,
    folder,
    tempFolder,
    scanCount,
    scanJobContent,
    filePattern,
    pageCountingStrategy,
  };

  return await createScanJobHandler(deviceCapabilities.isEscl, context).handle(
    jobUrl,
  );
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

  // Pages already downloaded live in scanJobContent. A failure while adding
  // another page (the printer answers 503 while it is still busy, or the
  // event channel drops) must not throw them away: keep them and let the
  // caller assemble the document with what was scanned.
  try {
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
  } catch (error) {
    logger.warn(
      { err: error },
      `Could not add another page; keeping the ${scanJobContent.elements.length} page(s) already scanned.`,
    );
  }
}
