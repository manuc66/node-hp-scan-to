import type { IEvent } from "./hpModels/Event.js";
import type WalkupScanDestination from "./hpModels/WalkupScanDestination.js";
import type WalkupScanToCompDestination from "./hpModels/WalkupScanToCompDestination.js";
import HPApi from "./HPApi.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import type { ScanContent } from "./type/ScanContent.js";
import { delay } from "./delay.js";
import { InputSource } from "./type/InputSource.js";
import { postProcessing } from "./postProcessing.js";
import type { SelectedScanTarget } from "./type/scanTargetDefinitions.js";
import { executeScanJob, executeScanJobs } from "./scanJobHandlers.js";
import { KnownShortcut } from "./type/KnownShortcut.js";
import type {
  AdfAutoScanConfig,
  ScanConfig,
  SingleScanConfig,
} from "./type/scanConfigs.js";
import { PageCountingStrategy } from "./type/pageCountingStrategy.js";
import type { IScanStatus } from "./hpModels/IScanStatus.js";
import { ScannerState } from "./hpModels/ScannerState.js";
import type { ScanPlexMode } from "./hpModels/ScanPlexMode.js";
import {
  mmToPixels,
  validateAndResolvePaperSize,
  isMaxPreset,
} from "./PaperSize.js";

export interface WalkupDestination {
  get shortcut(): null | KnownShortcut;
  get scanPlexMode(): ScanPlexMode | null;
}

export async function tryGetDestination(
  event: IEvent,
): Promise<WalkupDestination | null> {
  // this code can in some cases be executed before the user actually chooses between Document or Photo,
  // so, let's fetch the contentType (Document or Photo) until we get a value
  let destination: WalkupScanDestination | WalkupScanToCompDestination | null =
    null;

  for (let i = 0; i < 20; i++) {
    const destinationURI = event.destinationURI;
    if (destinationURI !== undefined) {
      destination = await HPApi.getDestination(destinationURI);

      const shortcut = destination.shortcut;
      if (shortcut !== null) {
        return destination;
      }
    } else {
      console.log(`No destination URI found`);
    }

    console.log(`No shortcut yet available, attempt: ${i + 1}/20`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s
  }

  console.log("Failing to detect destination shortcut");
  console.log(JSON.stringify(destination));
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
    console.log(
      `Unexpected shortcut received: ${destination.shortcut}, considering it as non pdf target!`,
    );
    return false;
  }
}

function getScanDimensionWithSelectors(
  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean,
  options: {
    maxFromCaps: (caps: { maxWidth: number | null; maxHeight: number | null }) => number | null;
    fromPaperResult: (r: { width: number | null; height: number | null }) => number | null;
    fromConfig: (c: ScanConfig) => number | "max" | undefined;
  },
): number | null {
  const caps = getMaxScanDimensions(inputSource, isDuplex, deviceCapabilities);
  const maxDim = options.maxFromCaps(caps);
  const hasPaperSizeConfig =
    scanConfig.paperSize !== undefined || scanConfig.paperDim !== undefined;
  if (hasPaperSizeConfig) {
    const paperSizeResult = applyPaperSizeConfig(
      scanConfig,
      caps.maxWidth,
      caps.maxHeight,

    );
    const valueFromPaper = paperSizeResult && options.fromPaperResult(paperSizeResult);
    if (valueFromPaper !== null) {
      return valueFromPaper;
    }
    return maxDim;
  }
  const dimConfig = options.fromConfig(scanConfig);
  if (dimConfig !== undefined) {
    if (dimConfig === "max" || dimConfig <= 0) {
      return maxDim;
    }
    const dimConfigPixels = Math.round((dimConfig * 300) / scanConfig.resolution);

    if (maxDim !== null && dimConfigPixels > maxDim) {
      return maxDim;
    }
    return dimConfigPixels;
  }
  return maxDim;
}

export function getScanWidth(  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean) {
  return getScanDimensionWithSelectors(scanConfig, inputSource, deviceCapabilities, isDuplex, {
    maxFromCaps: (c) => c.maxWidth,
    fromPaperResult: (r) => r.width,
    fromConfig: (c) => c.width,
  });
}
export function getScanHeight(  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean) {
  return getScanDimensionWithSelectors(scanConfig, inputSource, deviceCapabilities, isDuplex, {
    maxFromCaps: (c) => c.maxHeight,
    fromPaperResult: (r) => r.height,
    fromConfig: (c) => c.height,
  });
}
/**
 * Applies paper size / dimension configuration to compute scan region in pixels.
 *
 * This converts the configured paper size (preset or custom dimensions) into
 * pixel dimensions at 300 DPI, taking into account:
 * - Device maximum scan area
 * - "Max" preset, which directly uses device capabilities
 */
function applyPaperSizeConfig(
  scanConfig: ScanConfig,
  maxWidth: number | null,
  maxHeight: number | null,
): { width: number | null; height: number | null } | null {
  const hasPaperSizeConfig =
    scanConfig.paperSize !== undefined || scanConfig.paperDim !== undefined;

  if (!hasPaperSizeConfig) {
    return null;
  }

  // Special handling for "Max" preset: use device capabilities directly
  if (
    isMaxPreset(scanConfig.paperSize) &&
    maxWidth !== null &&
    maxHeight !== null
  ) {
    return {
      width: maxWidth,
      height: maxHeight,
    };
  }

  const maxWidthMm =
    maxWidth !== null ? (maxWidth * 25.4) / 300 : undefined;
  const maxHeightMm =
    maxHeight !== null ? (maxHeight * 25.4) / 300 : undefined;

  const resolved = validateAndResolvePaperSize(
    scanConfig.paperSize,
    scanConfig.paperDim,
    maxWidthMm ?? undefined,
    maxHeightMm ?? undefined,
  );

  if (!resolved) {
    return null;
  }

  const pixels = mmToPixels(
    resolved.resolvedMm.widthMm,
    resolved.resolvedMm.heightMm,
    300,
    300,
  );

  const newVar = {
    width: pixels.widthPx,
    height: pixels.heightPx,
  };
  console.log('Pixels calculated:', newVar);
  return newVar;
}

/**
 * Gets the maximum scan dimensions for a given input source and mode.
 *
 * @param inputSource - The scan input source (Platen or ADF)
 * @param isDuplex - Whether duplex scanning is enabled
 * @param deviceCapabilities - Device capabilities containing max dimensions
 * @returns Object with maxWidth and maxHeight in pixels
 */
function getMaxScanDimensions(
  inputSource: InputSource,
  isDuplex: boolean,
  deviceCapabilities: DeviceCapabilities,
): { maxWidth: number | null; maxHeight: number | null } {
  if (inputSource === InputSource.Adf) {
    return {
      maxWidth: isDuplex
        ? deviceCapabilities.adfDuplexMaxWidth
        : deviceCapabilities.adfMaxWidth,
      maxHeight: isDuplex
        ? deviceCapabilities.adfDuplexMaxHeight
        : deviceCapabilities.adfMaxHeight,
    };
  } else {
    return {
      maxWidth: deviceCapabilities.platenMaxWidth,
      maxHeight: deviceCapabilities.platenMaxHeight,
    };
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
    console.log(`Converting scan to PDF…`);
  } else {
    contentType = "Photo";
    destinationFolder = folder;
    filePattern = scanConfig.directoryConfig.filePattern;
  }

  const scanStatus = await deviceCapabilities.getScanStatus();

  if (scanStatus.scannerState !== ScannerState.Idle) {
    console.log("Scanner state is not Idle, aborting scan attempt...!");
  }

  console.log("ADF status: " + scanStatus.adfState);

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
): Promise<void> {
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  if (adfAutoScanConfig.generatePdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    console.log(`Converting scan to PDF...`);
  } else {
    contentType = "Photo";
    destinationFolder = folder;
  }

  const effectiveScanWidth = getScanWidth(
    adfAutoScanConfig,
    InputSource.Adf,
    deviceCapabilities,
    adfAutoScanConfig.isDuplex,
  );
  const effectiveScanHeight = getScanHeight(
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
    effectiveScanWidth,
    effectiveScanHeight,
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

  console.log(
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
): Promise<void> {
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  if (scanConfig.generatePdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    console.log(`Converting scan to PDF...`);
  } else {
    contentType = "Photo";
    destinationFolder = folder;
  }

  const scanStatus = await deviceCapabilities.getScanStatus();

  if (scanStatus.scannerState !== ScannerState.Idle) {
    console.log("Scanner state is not Idle, aborting scan attempt...!");
  }

  console.log("ADF is: " + scanStatus.adfState);

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

  console.log(
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
): Promise<void> {
  let ready = false;
  while (!ready) {
    let scanStatus: IScanStatus = await getScanStatus();
    while (!scanStatus.isLoaded()) {
      await delay(pollingInterval);
      scanStatus = await getScanStatus();
    }
    console.log(`ADF load detected`);

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
      console.log(`ADF still loaded, proceeding`);
    } else {
      console.log(`ADF not loaded anymore, waiting...`);
    }
  }
}
