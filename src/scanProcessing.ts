import Event from "./hpModels/Event";
import WalkupScanDestination from "./hpModels/WalkupScanDestination";
import WalkupScanToCompDestination from "./hpModels/WalkupScanToCompDestination";
import HPApi from "./HPApi";
import { DeviceCapabilities } from "./type/DeviceCapabilities";
import { ScanContent } from "./type/ScanContent";
import { delay } from "./delay";
import { InputSource } from "./type/InputSource";
import { postProcessing } from "./postProcessing";
import { SelectedScanTarget } from "./type/scanTargetDefinitions";
import { executeScanJob, executeScanJobs } from "./scanJobHandlers";
import { KnownShortcut } from "./type/KnownShortcut";
import {
  AdfAutoScanConfig,
  ScanConfig,
  SingleScanConfig,
} from "./type/scanConfigs";
import { PageCountingStrategy } from "./type/pageCountingStrategy";
import { IScanStatus } from "./hpModels/IScanStatus";
import { ScannerState } from "./hpModels/ScannerState";
import { ScanPlexMode } from "./hpModels/ScanPlexMode";
import { getLoggerForFile } from "./logger";

const logger = getLoggerForFile(__filename);

export interface WalkupDestination {
  get shortcut(): null | KnownShortcut;
  get scanPlexMode(): ScanPlexMode | null;
}

export async function tryGetDestination(
  event: Event,
): Promise<WalkupDestination | null> {
  // this code can in some cases be executed before the user actually chooses between Document or Photo,
  // so, let's fetch the contentType (Document or Photo) until we get a value
  let destination: WalkupScanDestination | WalkupScanToCompDestination | null =
    null;

  for (let i = 0; i < 20; i++) {
    const destinationURI = event.destinationURI;
    if (destinationURI) {
      destination = await HPApi.getDestination(destinationURI);

      const shortcut = destination.shortcut;
      if (shortcut != null) {
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

export function isPdf(destination: WalkupDestination) {
  if (
    destination.shortcut === KnownShortcut.SavePDF ||
    destination.shortcut === KnownShortcut.EmailPDF ||
    destination.shortcut == KnownShortcut.SaveDocument1
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

export function getScanWidth(
  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean,
): number | null {
  const maxWidth =
    inputSource === InputSource.Adf
      ? isDuplex
        ? deviceCapabilities.adfDuplexMaxWidth
        : deviceCapabilities.adfMaxWidth
      : deviceCapabilities.platenMaxWidth;

  if (scanConfig.width && scanConfig.width > 0) {
    if (maxWidth && scanConfig.width > maxWidth) {
      return maxWidth;
    } else {
      return scanConfig.width;
    }
  } else {
    return maxWidth;
  }
}

export function getScanHeight(
  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean,
): number | null {
  const maxHeight =
    inputSource === InputSource.Adf
      ? isDuplex
        ? deviceCapabilities.adfDuplexMaxHeight
        : deviceCapabilities.adfMaxHeight
      : deviceCapabilities.platenMaxHeight;

  if (scanConfig.height && scanConfig.height > 0) {
    if (maxHeight && scanConfig.height > maxHeight) {
      return maxHeight;
    } else {
      return scanConfig.height;
    }
  } else {
    return maxHeight;
  }
}

export async function saveScanFromEvent(
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
  if (isPdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    filePattern = undefined;
    logger.info(`Converting scan to PDF…`);
  } else {
    contentType = "Photo";
    destinationFolder = folder;
    filePattern = scanConfig.directoryConfig.filePattern;
  }

  const scanStatus = await deviceCapabilities.getScanStatus();

  if (scanStatus.scannerState !== ScannerState.Idle) {
    logger.warn("Scanner state is not Idle, aborting scan attempt...!");
  }

  logger.info("ADF status: " + scanStatus.adfState);

  const inputSource = scanStatus.getInputSource();
  const scanWidth = getScanWidth(
    scanConfig,
    inputSource,
    deviceCapabilities,
    isDuplex,
  );
  const scanHeight = getScanHeight(
    scanConfig,
    inputSource,
    deviceCapabilities,
    isDuplex,
  );

  const scanJobSettings = deviceCapabilities.createScanJobSettings(
    inputSource,
    contentType,
    scanConfig.resolution,
    scanConfig.mode,
    scanWidth,
    scanHeight,
    isDuplex,
  );

  const scanJobContent: ScanContent = { elements: [] };

  await executeScanJobs(
    scanJobSettings,
    inputSource,
    destinationFolder,
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
  scanCount: number,
  folder: string,
  tempFolder: string,
  adfAutoScanConfig: AdfAutoScanConfig,
  deviceCapabilities: DeviceCapabilities,
  date: Date,
) {
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  if (adfAutoScanConfig.generatePdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    logger.info(`Converting scan to PDF…`);
  } else {
    contentType = "Photo";
    destinationFolder = folder;
  }

  const scanWidth = getScanWidth(
    adfAutoScanConfig,
    InputSource.Adf,
    deviceCapabilities,
    adfAutoScanConfig.isDuplex,
  );
  const scanHeight = getScanHeight(
    adfAutoScanConfig,
    InputSource.Adf,
    deviceCapabilities,
    adfAutoScanConfig.isDuplex,
  );

  const scanJobSettings = deviceCapabilities.createScanJobSettings(
    InputSource.Adf,
    contentType,
    adfAutoScanConfig.resolution,
    adfAutoScanConfig.mode,
    scanWidth,
    scanHeight,
    adfAutoScanConfig.isDuplex,
  );

  const scanJobContent: ScanContent = { elements: [] };

  await executeScanJob(
    scanJobSettings,
    InputSource.Adf,
    destinationFolder,
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
  scanCount: number,
  folder: string,
  tempFolder: string,
  scanConfig: SingleScanConfig,
  deviceCapabilities: DeviceCapabilities,
  date: Date,
) {
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  if (scanConfig.generatePdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    logger.info(`Converting scan to PDF…`);
  } else {
    contentType = "Photo";
    destinationFolder = folder;
  }

  const scanStatus = await deviceCapabilities.getScanStatus();

  if (scanStatus.scannerState !== ScannerState.Idle) {
    logger.info("Scanner state is not Idle, aborting scan attempt...!");
  }

  logger.info("ADF is: " + scanStatus.adfState);

  const inputSource = scanStatus.getInputSource();

  const scanWidth = getScanWidth(
    scanConfig,
    inputSource,
    deviceCapabilities,
    scanConfig.isDuplex,
  );
  const scanHeight = getScanHeight(
    scanConfig,
    inputSource,
    deviceCapabilities,
    scanConfig.isDuplex,
  );

  const scanJobSettings = deviceCapabilities.createScanJobSettings(
    inputSource,
    contentType,
    scanConfig.resolution,
    scanConfig.mode,
    scanWidth,
    scanHeight,
    scanConfig.isDuplex,
  );

  const scanJobContent: ScanContent = { elements: [] };

  await executeScanJob(
    scanJobSettings,
    inputSource,
    destinationFolder,
    scanCount,
    scanJobContent,
    scanConfig.directoryConfig.filePattern,
    PageCountingStrategy.Normal,
    deviceCapabilities,
  );

  logger.info(
    `Scan of page(s) completed, total pages: ${scanJobContent.elements.length}:`,
  );

  await postProcessing(
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
  pollingInterval: number,
  startScanDelay: number,
  getScanStatus: () => Promise<IScanStatus>,
) {
  let ready = false;
  while (!ready) {
    let scanStatus: IScanStatus = await getScanStatus();
    while (!scanStatus.isLoaded()) {
      await delay(pollingInterval);
      scanStatus = await getScanStatus();
    }
    logger.info(`ADF load detected`);

    let loaded = true;
    let counter = 0;
    const shortPollingInterval = 500;
    while (loaded && counter < startScanDelay) {
      await delay(shortPollingInterval);
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
