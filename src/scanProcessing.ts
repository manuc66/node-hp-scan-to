import type { IEvent } from "./hpModels/Event.js";
import type WalkupScanDestination from "./hpModels/WalkupScanDestination.js";
import type WalkupScanToCompDestination from "./hpModels/WalkupScanToCompDestination.js";
import type DeviceClient from "./DeviceClient.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import type { ScanContent } from "./type/ScanContent.js";
import { InputSource } from "./type/InputSource.js";
import { postProcessing, type PostProcessingResult } from "./postProcessing.js";
import { getScanDimensions } from "./scanDimensions.js";
import type { SelectedScanTarget } from "./type/scanTargetDefinitions.js";
import { executeScanJob, executeScanJobs } from "./scanJobHandlers.js";
import { KnownShortcut } from "./type/KnownShortcut.js";
import type {
  AdfAutoScanConfig,
  ScanConfig,
  SingleScanConfig,
} from "./type/scanConfigs.js";
import { ScanFormat } from "./type/scanFormat.js";
import { PageCountingStrategy } from "./type/pageCountingStrategy.js";
import type { IScanStatus } from "./hpModels/IScanStatus.js";
import { ScannerState } from "./hpModels/ScannerState.js";
import type { ScanPlexMode } from "./hpModels/ScanPlexMode.js";
import { createImageFormat, type ImageFormat } from "./imageFormats/index.js";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

export interface WalkupDestination {
  get shortcut(): null | KnownShortcut;

  get scanPlexMode(): ScanPlexMode | null;
}

export async function tryGetDestination(
  api: DeviceClient,
  event: IEvent,
): Promise<WalkupDestination | null> {
  let destination: WalkupScanDestination | WalkupScanToCompDestination | null =
    null;

  for (let i = 0; i < 20; i++) {
    const destinationURI = event.destinationURI;
    if (destinationURI !== undefined) {
      destination = await api.getDestination(destinationURI);

      const shortcut = destination.shortcut;
      if (shortcut !== null) {
        return destination;
      }
    } else {
      logger.warn(`No destination URI found`);
    }

    logger.info(`No shortcut yet available, attempt: ${i + 1}/20`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s
  }

  logger.error(destination, "Failing to detect destination shortcut");
  return null;
}

export function isPdf(destination: WalkupDestination): boolean {
  if (
    destination.shortcut === KnownShortcut.SavePDF ||
    destination.shortcut === KnownShortcut.EmailPDF ||
    destination.shortcut === KnownShortcut.SaveDocument1
  ) {
    return true;
  } else if (
    destination.shortcut === KnownShortcut.SaveJPEG ||
    destination.shortcut === KnownShortcut.SavePhoto1
  ) {
    return false;
  } else {
    logger.warn(
      `Unexpected shortcut received: ${destination.shortcut}, considering it as non pdf target!`,
    );
    return false;
  }
}

export async function saveScanFromEvent(
  api: DeviceClient,
  selectedScanTarget: SelectedScanTarget,
  folder: string,
  tempFolder: string,
  scanCount: number,
  deviceCapabilities: DeviceCapabilities,
  scanConfig: ScanConfig,
  isDuplex: boolean,
  isPdf: boolean,
  pageCountingStrategy: PageCountingStrategy,
): Promise<ScanContent> {
  let destinationFolder: string;
  let contentType: "Document" | "Photo";

  let filePattern: string | undefined;
  let effectiveFormat = scanConfig.format;
  if (isPdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    filePattern = undefined;
    logger.info(`Converting scan to PDF…`);
    effectiveFormat = ScanFormat.Jpeg;
  } else {
    contentType = "Photo";
    destinationFolder = folder;
    filePattern = scanConfig.directoryConfig.filePattern;
  }

  const scanStatus = await deviceCapabilities.getScanStatus();

  if (scanStatus.scannerState !== ScannerState.Idle) {
    logger.warn(
      `Scanner state is not Idle: ${scanStatus.scannerState}, aborting scan attempt...!`,
    );
    return { elements: [] };
  }

  logger.info(`ADF status: ${scanStatus.adfState}`);

  const inputSource = scanStatus.getInputSource();

  const { width: scanWidth, height: scanHeight } = getScanDimensions(
    scanConfig,
    inputSource,
    deviceCapabilities,
    isDuplex,
  );

  const imageFormat: ImageFormat = createImageFormat(effectiveFormat);

  const scanJobSettings = deviceCapabilities.createScanJobSettings(
    inputSource,
    contentType,
    imageFormat,
    scanConfig.resolution,
    scanConfig.mode,
    scanWidth,
    scanHeight,
    isDuplex,
  );

  const scanJobContent: ScanContent = { elements: [] };

  await executeScanJobs(
    api,
    scanJobSettings,
    inputSource,
    destinationFolder,
    tempFolder,
    scanCount,
    scanJobContent,
    selectedScanTarget,
    deviceCapabilities,
    filePattern,
    pageCountingStrategy,
  );

  return scanJobContent;
}

export async function scanFromAdf(
  api: DeviceClient,
  scanCount: number,
  folder: string,
  tempFolder: string,
  adfAutoScanConfig: AdfAutoScanConfig,
  deviceCapabilities: DeviceCapabilities,
  date: Date,
): Promise<void> {
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  let effectiveFormat = adfAutoScanConfig.format;
  if (adfAutoScanConfig.generatePdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    logger.info(`Converting scan to PDF...`);
    effectiveFormat = ScanFormat.Jpeg;
  } else {
    contentType = "Photo";
    destinationFolder = folder;
  }

  const { width: effectiveScanWidth, height: effectiveScanHeight } =
    getScanDimensions(
      adfAutoScanConfig,
      InputSource.Adf,
      deviceCapabilities,
      adfAutoScanConfig.isDuplex,
    );

  const imageFormat: ImageFormat = createImageFormat(effectiveFormat);

  const scanJobSettings = deviceCapabilities.createScanJobSettings(
    InputSource.Adf,
    contentType,
    imageFormat,
    adfAutoScanConfig.resolution,
    adfAutoScanConfig.mode,
    effectiveScanWidth,
    effectiveScanHeight,
    adfAutoScanConfig.isDuplex,
  );

  const scanJobContent: ScanContent = { elements: [] };

  await executeScanJob(
    api,
    scanJobSettings,
    InputSource.Adf,
    destinationFolder,
    tempFolder,
    scanCount,
    scanJobContent,
    adfAutoScanConfig.directoryConfig.filePattern,
    PageCountingStrategy.Normal,
    deviceCapabilities,
  );

  logger.info(
    `Scan of page(s) completed, total pages: ${scanJobContent.elements.length}:`,
  );

  await postProcessing(
    adfAutoScanConfig,
    folder,
    tempFolder,
    scanCount,
    scanJobContent,
    date,
    adfAutoScanConfig.generatePdf,
  );
}

export async function singleScan(
  api: DeviceClient,
  scanCount: number,
  folder: string,
  tempFolder: string,
  scanConfig: SingleScanConfig,
  deviceCapabilities: DeviceCapabilities,
  date: Date,
): Promise<PostProcessingResult> {
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  let effectiveFormat = scanConfig.format;
  if (scanConfig.generatePdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    logger.info(`Converting scan to PDF...`);
    effectiveFormat = ScanFormat.Jpeg;
  } else {
    contentType = "Photo";
    destinationFolder = folder;
  }

  const scanStatus = await deviceCapabilities.getScanStatus();

  if (scanStatus.scannerState !== ScannerState.Idle) {
    logger.warn(
      `Scanner state is not Idle: ${scanStatus.scannerState}, aborting scan attempt...!`,
    );
    return { uploadSucceeded: true, failures: [] };
  }

  logger.info(`ADF is: ${scanStatus.adfState}`);

  const inputSource = scanStatus.getInputSource();

  const { width: scanWidth, height: scanHeight } = getScanDimensions(
    scanConfig,
    inputSource,
    deviceCapabilities,
    scanConfig.isDuplex,
  );

  const imageFormat: ImageFormat = createImageFormat(effectiveFormat);

  const scanJobSettings = deviceCapabilities.createScanJobSettings(
    inputSource,
    contentType,
    imageFormat,
    scanConfig.resolution,
    scanConfig.mode,
    scanWidth,
    scanHeight,
    scanConfig.isDuplex,
  );

  const scanJobContent: ScanContent = { elements: [] };

  await executeScanJob(
    api,
    scanJobSettings,
    inputSource,
    destinationFolder,
    tempFolder,
    scanCount,
    scanJobContent,
    scanConfig.directoryConfig.filePattern,
    PageCountingStrategy.Normal,
    deviceCapabilities,
  );

  logger.info(
    `Scan of page(s) completed, total pages: ${scanJobContent.elements.length}:`,
  );

  return await postProcessing(
    scanConfig,
    folder,
    tempFolder,
    scanCount,
    scanJobContent,
    date,
    scanConfig.generatePdf,
  );
}

export async function waitAdfLoaded(
  api: DeviceClient,
  pollingInterval: number,
  startScanDelay: number,
  getScanStatus: () => Promise<IScanStatus>,
): Promise<void> {
  let ready = false;
  while (!ready) {
    let scanStatus: IScanStatus = await getScanStatus();
    while (!scanStatus.isLoaded()) {
      await api.delay(pollingInterval);
      scanStatus = await getScanStatus();
    }
    logger.info(`ADF load detected`);

    let loaded = true;
    let counter = 0;
    const shortPollingInterval = 500;
    while (loaded && counter < startScanDelay) {
      await api.delay(shortPollingInterval);
      scanStatus = await getScanStatus();
      loaded = scanStatus.isLoaded();
      counter += shortPollingInterval;
    }

    if (loaded && counter >= startScanDelay) {
      ready = true;
      logger.info(`ADF still loaded, proceeding`);
    } else {
      logger.info(`ADF not loaded anymore, waiting...`);
    }
  }
}
