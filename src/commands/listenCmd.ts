import type {
  RegistrationConfig,
  ScanTarget,
} from "../type/scanTargetDefinitions.js";
import type DeviceClient from "../DeviceClient.js";
import { readDeviceCapabilities } from "../readDeviceCapabilities.js";
import type { ScanContent } from "../type/ScanContent.js";
import {
  isPdf,
  saveScanFromEvent,
  type WalkupDestination,
} from "../scanProcessing.js";
import { enqueueScanProcessing } from "../queue/processingQueue.js";
import PathHelper from "../PathHelper.js";
import { createScanListener } from "../scanListeners/createScanListener.js";
import type {
  ScanListener,
  ScanRequest,
} from "../scanListeners/ScanListener.js";

import { DuplexMode } from "../type/duplexMode.js";
import { TargetDuplexMode } from "../type/targetDuplexMode.js";
import type { ScanConfig } from "../type/scanConfigs.js";
import { PageCountingStrategy } from "../type/pageCountingStrategy.js";
import { ScanPlexMode } from "../hpModels/ScanPlexMode.js";
import type { DeviceCapabilities } from "../type/DeviceCapabilities.js";
import { DuplexAssemblyMode } from "../type/DuplexAssemblyMode.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

let iteration = 0;

export async function listenCmd(
  api: DeviceClient,
  registrationConfigs: RegistrationConfig[],
  scanConfig: ScanConfig,
  deviceUpPollingInterval: number,
) {
  await api.waitDeviceUp(deviceUpPollingInterval);
  let deviceUp = true;

  const folder = await PathHelper.getTargetFolder(
    scanConfig.directoryConfig.directory,
  );

  const tempFolder = await PathHelper.getTempFolder(
    scanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities(
    api,
    scanConfig.preferEscl,
    true,
  );

  const scanListener = createScanListener(
    api,
    deviceCapabilities,
    registrationConfigs,
  );

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  let lastScanTarget: ScanTarget | undefined = undefined;

  let lastDuplexMode: DuplexMode = DuplexMode.Simplex;

  let frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null =
    null;

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void scanListener.dispose?.().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    while (keepActive) {
      iteration++;
      logger.info(`Iteration ${iteration} (Errors so far: ${errorCount})`);
      try {
        const selectedScanTarget: ScanRequest | null =
          await scanListener.waitForScan();

        if (selectedScanTarget === null) {
          continue;
        }

        const proceedToScan =
          await scanListener.waitForScanStart(selectedScanTarget);

        if (!proceedToScan || selectedScanTarget.shortcut === null) {
          logger.warn(
            "No shortcut selected - Impossible to proceed with scan, skipping.",
          );
          continue;
        }

        const r = await processScanWithDestination(
          api,
          selectedScanTarget,
          lastDuplexMode,
          lastScanTarget,
          folder,
          tempFolder,
          scanConfig,
          deviceCapabilities,
          scanListener,
          scanCount,
          frontOfDoubleSidedScanContext,
        );

        scanCount = r.scanCount;
        frontOfDoubleSidedScanContext = r.frontOfDoubleSidedScanContext;

        lastScanTarget = selectedScanTarget;
        lastDuplexMode = r.duplexMode;
      } catch (e) {
        if (await api.isAlive()) {
          logger.error(e);
          errorCount++;
        } else {
          logger.debug(e);
          deviceUp = false;
        }
      }

      if (errorCount === 50) {
        keepActive = false;
      }

      if (!deviceUp) {
        await api.waitDeviceUp(deviceUpPollingInterval);
      } else {
        await api.delay(1000);
      }
    }
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    await scanListener.dispose?.();
  }
}

export async function processScanWithDestination(
  api: DeviceClient,
  selectedScanTarget: ScanRequest,
  lastDuplexMode: DuplexMode,
  lastScanTarget: ScanTarget | undefined,
  folder: string,
  tempFolder: string,
  scanConfig: ScanConfig,
  deviceCapabilities: DeviceCapabilities,
  scanListener: ScanListener,
  scanCount: number,
  frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null,
) {
  logger.info(`Selected shortcut: ${selectedScanTarget.shortcut}`);

  const { duplexMode, targetDuplexMode } = determineDuplexModes(
    selectedScanTarget,
    selectedScanTarget,
    lastDuplexMode,
    lastScanTarget,
  );
  if (
    lastScanTarget !== undefined &&
    frontOfDoubleSidedScanContext !== null &&
    lastScanTarget.isDuplexSingleSide &&
    lastDuplexMode === DuplexMode.FrontOfDoubleSided &&
    (duplexMode === DuplexMode.Simplex || duplexMode === DuplexMode.Duplex)
  ) {
    processFinishedPartialDuplexScan(
      lastScanTarget,
      selectedScanTarget,
      scanCount,
      frontOfDoubleSidedScanContext,
    );
  }

  const scanParameters = await setupScanParameters(
    duplexMode,
    targetDuplexMode,
    selectedScanTarget,
    scanCount,
    folder,
    scanConfig,
    frontOfDoubleSidedScanContext,
  );

  const {
    pageCountingStrategy,
    scanToPdf,
    scanDate,
    scanCount: newScanCount,
  } = scanParameters;
  scanCount = newScanCount;

  const scanJobContent = await saveScanFromEvent(
    api,
    selectedScanTarget,
    folder,
    tempFolder,
    scanCount,
    deviceCapabilities,
    scanListener,
    scanConfig,
    targetDuplexMode === TargetDuplexMode.Duplex,
    scanToPdf,
    pageCountingStrategy,
  );

  frontOfDoubleSidedScanContext = handleScanResult(
    duplexMode,
    frontOfDoubleSidedScanContext,
    scanConfig,
    folder,
    tempFolder,
    scanCount,
    scanJobContent,
    scanDate,
    scanToPdf,
    selectedScanTarget.duplexAssemblyMode ?? DuplexAssemblyMode.DOCUMENT_WISE,
  );
  return { scanCount, frontOfDoubleSidedScanContext, duplexMode };
}

export function handleScanResult(
  duplexMode: DuplexMode,
  frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null,
  scanConfig: ScanConfig,
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  scanToPdf: boolean,
  duplexAssemblyMode: DuplexAssemblyMode,
): FrontOfDoubleSidedScanContext | null {
  if (duplexMode === DuplexMode.FrontOfDoubleSided) {
    frontOfDoubleSidedScanContext = {
      scanConfig,
      folder,
      tempFolder,
      scanCount,
      scanJobContent,
      scanDate,
      scanToPdf,
    };
  } else {
    let finalScanJobContent: ScanContent;
    if (duplexMode === DuplexMode.BackOfDoubleSided) {
      logger.info(
        "Emulated duplex scan completed; front and back pages are being assembled",
      );
      const frontScans = frontOfDoubleSidedScanContext?.scanJobContent ?? {
        elements: [],
      };
      finalScanJobContent = assembleDuplexScan(
        frontScans,
        scanJobContent,
        duplexAssemblyMode,
      );
    } else {
      finalScanJobContent = scanJobContent;
    }

    enqueueScanProcessing({
      scanConfig,
      folder,
      tempFolder,
      scanCount,
      scanJobContent: finalScanJobContent,
      scanDate,
      toPdf: scanToPdf,
    });
  }
  return frontOfDoubleSidedScanContext;
}

export function determineDuplexModes(
  destination: WalkupDestination,
  selectedScanTarget: ScanTarget,
  previousDuplexMode: DuplexMode,
  lastScanTarget: ScanTarget | undefined,
) {
  const isDuplex =
    destination.scanPlexMode !== null &&
    destination.scanPlexMode !== ScanPlexMode.Simplex;

  let duplexMode: DuplexMode;

  let targetDuplexMode: TargetDuplexMode;
  if (isDuplex) {
    targetDuplexMode = TargetDuplexMode.Duplex;
    duplexMode = DuplexMode.Duplex;
  } else if (selectedScanTarget.isDuplexSingleSide) {
    targetDuplexMode = TargetDuplexMode.EmulatedDuplex;
    if (
      selectedScanTarget.resourceURI === lastScanTarget?.resourceURI &&
      previousDuplexMode !== DuplexMode.BackOfDoubleSided
    ) {
      duplexMode = DuplexMode.BackOfDoubleSided;
    } else {
      duplexMode = DuplexMode.FrontOfDoubleSided;
    }
  } else {
    targetDuplexMode = TargetDuplexMode.Simplex;
    duplexMode = DuplexMode.Simplex;
  }

  return { duplexMode, targetDuplexMode };
}

export function assembleDuplexScan(
  frontScan: ScanContent,
  backScan: ScanContent,
  mode: DuplexAssemblyMode,
): ScanContent {
  let frontContent = frontScan.elements;
  let backContent = backScan.elements;

  // Apply inversions based on the selected mode
  switch (mode) {
    case DuplexAssemblyMode.PAGE_WISE:
      // Fronts and backs are in natural order; no changes needed
      break;

    case DuplexAssemblyMode.DOCUMENT_WISE:
      // Backs are reversed because the stack was flipped
      backContent = [...backContent].reverse();
      break;

    case DuplexAssemblyMode.REVERSE_FRONT:
      // Fronts are reversed (e.g., stack inserted backwards)
      frontContent = [...frontContent].reverse();
      break;

    case DuplexAssemblyMode.REVERSE_BOTH:
      // Both fronts and backs are reversed
      frontContent = [...frontContent].reverse();
      backContent = [...backContent].reverse();
      break;
  }

  const duplexScan: ScanContent = { elements: [] };
  const maxLength = Math.max(frontContent.length, backContent.length);

  // Interleave pages, tolerating missing last back page gracefully
  for (let i = 0; i < maxLength; i++) {
    if (i < frontContent.length) {
      duplexScan.elements.push(frontContent[i]);
    }
    if (i < backContent.length) {
      duplexScan.elements.push(backContent[i]);
    }
  }

  return duplexScan;
}

interface ScanParameters {
  pageCountingStrategy: PageCountingStrategy;
  scanToPdf: boolean;
  scanDate: Date;
  scanCount: number;
}

export async function setupScanParameters(
  duplexMode: DuplexMode,
  targetDuplexMode: TargetDuplexMode,
  destination: WalkupDestination,
  scanCount: number,
  folder: string,
  scanConfig: ScanConfig,
  frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null = null,
): Promise<ScanParameters> {
  let pageCountingStrategy: PageCountingStrategy;
  let scanToPdf: boolean;
  let scanDate: Date;
  logger.info(`Scan mode: ${targetDuplexMode}`);
  if (duplexMode === DuplexMode.Duplex) {
    pageCountingStrategy = PageCountingStrategy.Normal;
    scanToPdf = isPdf(destination);
    scanDate = new Date();
    scanCount = await PathHelper.getNextScanNumber(
      folder,
      scanCount,
      scanConfig.directoryConfig.filePattern,
    );
    logger.info(`Scan event captured, saving scan #${scanCount}`);
  } else if (targetDuplexMode === TargetDuplexMode.EmulatedDuplex) {
    if (duplexMode === DuplexMode.FrontOfDoubleSided) {
      pageCountingStrategy = PageCountingStrategy.OddOnly;
      scanToPdf = isPdf(destination);
      scanDate = new Date();
      scanCount = await PathHelper.getNextScanNumber(
        folder,
        scanCount,
        scanConfig.directoryConfig.filePattern,
      );

      logger.info(
        `Scan event captured, saving front sides of scan #${scanCount}`,
      );
    } else {
      pageCountingStrategy = PageCountingStrategy.EvenOnly;
      scanToPdf =
        frontOfDoubleSidedScanContext?.scanToPdf ?? isPdf(destination);
      scanDate = frontOfDoubleSidedScanContext?.scanDate ?? new Date();
      scanCount = frontOfDoubleSidedScanContext?.scanCount ?? scanCount;
      logger.info(
        `Scan event captured, saving back sides of scan #${scanCount}`,
      );
    }
  } else {
    pageCountingStrategy = PageCountingStrategy.Normal;
    scanToPdf = isPdf(destination);
    scanDate = new Date();
    scanCount = await PathHelper.getNextScanNumber(
      folder,
      scanCount,
      scanConfig.directoryConfig.filePattern,
    );
    logger.info(`Scan event captured, saving scan #${scanCount}`);
  }

  return { pageCountingStrategy, scanToPdf, scanDate, scanCount };
}

export function processFinishedPartialDuplexScan(
  lastScanTarget: ScanTarget,
  selectedScanTarget: ScanTarget,
  scanCount: number,
  frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext,
): void {
  logger.info(
    `Scan target changed from ${lastScanTarget.label} to ${selectedScanTarget.label}, saving scan #${scanCount} before processing`,
  );

  enqueueScanProcessing({
    scanConfig: frontOfDoubleSidedScanContext.scanConfig,
    folder: frontOfDoubleSidedScanContext.folder,
    tempFolder: frontOfDoubleSidedScanContext.tempFolder,
    scanCount: frontOfDoubleSidedScanContext.scanCount,
    scanJobContent: frontOfDoubleSidedScanContext.scanJobContent,
    scanDate: frontOfDoubleSidedScanContext.scanDate,
    toPdf: frontOfDoubleSidedScanContext.scanToPdf,
  });
}

export interface FrontOfDoubleSidedScanContext {
  scanConfig: ScanConfig;
  folder: string;
  tempFolder: string;
  scanCount: number;
  scanJobContent: ScanContent;
  scanDate: Date;
  scanToPdf: boolean;
}
