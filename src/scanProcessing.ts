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
  ESCL_UNIT_RESOLUTION,
  validateAndResolvePaperSize,
  paperSizeMmToScanRegion,
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

/**
 * Returns the unit resolution for scan region dimensions.
 *
 * eSCL: always 1/300 inch (ContentRegionUnits = ThreeHundredthsOfInches, per spec).
 * Non-eSCL: pixels at the configured scan DPI.
 */
function getUnitResolution(): number {
  return ESCL_UNIT_RESOLUTION;
}

/**
 * Gets the maximum scan dimensions for a given input source and mode,
 * expressed in device units (eSCL: 1/300", non-eSCL: pixels at scan DPI).
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
  }
  return {
    maxWidth: deviceCapabilities.platenMaxWidth,
    maxHeight: deviceCapabilities.platenMaxHeight,
  };
}

/**
 * Resolves a paper size configuration to scan region dimensions in device units.
 *
 * Handles three cases:
 *  1. "Max" preset  → use device capability limits directly
 *  2. Named preset or custom "WxH<unit>" → resolve to mm, clamp, convert
 *  3. No paper size config → returns null (caller falls back to other logic)
 *
 * @param scanConfig   - User scan configuration (paperSize / paperDim)
 * @param maxWidth     - Device max width in device units (null = unconstrained)
 * @param maxHeight    - Device max height in device units (null = unconstrained)
 * @param isEscl       - True if the device uses the eSCL protocol
 */
function resolvePaperSizeToScanRegion(
  scanConfig: ScanConfig,
  maxWidth: number | null,
  maxHeight: number | null,
  isEscl: boolean,
): { width: number; height: number } | null {
  if (scanConfig.paperSize === undefined && scanConfig.paperDim === undefined) {
    return null;
  }

  const unitResolution = getUnitResolution();

  // "Max" preset: use device capability limits directly — no mm round-trip needed.
  if (isMaxPreset(scanConfig.paperSize)) {
    if (maxWidth === null || maxHeight === null) {
      return null;
    }
    return { width: maxWidth, height: maxHeight };
  }

  // Resolve preset or custom dimension to mm (no clamping here).
  const resolved = validateAndResolvePaperSize(
    scanConfig.paperSize,
    scanConfig.paperDim,
  );
  if (!resolved) {
    return null;
  }

  // Convert to device units and clamp to device limits.
  const region = paperSizeMmToScanRegion(
    resolved.resolvedMm,
    unitResolution,
    maxWidth,
    maxHeight,
  );

  console.log(
    `Paper size resolved: ${resolved.source}` +
      ` → ${region.width}×${region.height} units` +
      ` (unitResolution=${unitResolution}, isEscl=${isEscl})`,
  );

  return { width: region.width, height: region.height };
}

function getScanDimensionWithSelectors(
  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean,
  options: {
    maxFromCaps: (caps: {
      maxWidth: number | null;
      maxHeight: number | null;
    }) => number | null;
    fromPaperResult: (r: { width: number; height: number }) => number;
    fromConfig: (c: ScanConfig) => number | "max" | undefined;
  },
): number | null {
  const caps = getMaxScanDimensions(inputSource, isDuplex, deviceCapabilities);
  const maxDim = options.maxFromCaps(caps);

  const paperRegion = resolvePaperSizeToScanRegion(
    scanConfig,
    caps.maxWidth,
    caps.maxHeight,
    deviceCapabilities.isEscl,
  );

  if (paperRegion !== null) {
    return options.fromPaperResult(paperRegion);
  }

  // No paper size config: fall back to explicit width/height config or device max.
  const dimConfig = options.fromConfig(scanConfig);
  if (dimConfig !== undefined) {
    if (dimConfig === "max" || dimConfig <= 0) {
      return maxDim;
    }
    const unitResolution = getUnitResolution();
    const dimInUnits = Math.round(dimConfig * unitResolution);
    if (maxDim !== null && dimInUnits > maxDim) {
      return maxDim;
    }
    return dimInUnits;
  }

  return maxDim;
}

export function getScanWidth(
  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean,
): number | null {
  return getScanDimensionWithSelectors(
    scanConfig,
    inputSource,
    deviceCapabilities,
    isDuplex,
    {
      maxFromCaps: (c) => c.maxWidth,
      fromPaperResult: (r) => r.width,
      fromConfig: (c) => c.width,
    },
  );
}

export function getScanHeight(
  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean,
): number | null {
  return getScanDimensionWithSelectors(
    scanConfig,
    inputSource,
    deviceCapabilities,
    isDuplex,
    {
      maxFromCaps: (c) => c.maxHeight,
      fromPaperResult: (r) => r.height,
      fromConfig: (c) => c.height,
    },
  );
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
