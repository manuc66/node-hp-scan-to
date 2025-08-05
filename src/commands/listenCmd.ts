import {
  RegistrationConfig,
  SelectedScanTarget,
} from "../type/scanTargetDefinitions";
import HPApi from "../HPApi";
import { readDeviceCapabilities } from "../readDeviceCapabilities";
import { ScanContent } from "../type/ScanContent";
import { waitScanEvent, waitScanRequest } from "../listening";
import {
  isPdf,
  saveScanFromEvent,
  tryGetDestination,
  WalkupDestination,
} from "../scanProcessing";
import { postProcessing } from "../postProcessing";
import PathHelper from "../PathHelper";
import { delay } from "../delay";
import { DuplexMode } from "../type/duplexMode";
import { TargetDuplexMode } from "../type/targetDuplexMode";
import { ScanConfig } from "../type/scanConfigs";
import { PageCountingStrategy } from "../type/pageCountingStrategy";
import { ScanPlexMode } from "../hpModels/ScanPlexMode";
import { DeviceCapabilities } from "../type/DeviceCapabilities";

let iteration = 0;

export async function listenCmd(
  registrationConfigs: RegistrationConfig[],
  scanConfig: ScanConfig,
  deviceUpPollingInterval: number,
) {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp(deviceUpPollingInterval);
  let deviceUp = true;

  const folder = await PathHelper.getTargetFolder(
    scanConfig.directoryConfig.directory,
  );

  const tempFolder = await PathHelper.getTempFolder(
    scanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities(
    scanConfig.preferEscl,
  );

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  let lastScanTarget: SelectedScanTarget | undefined = undefined;

  let lastDuplexMode: DuplexMode = DuplexMode.Simplex;

  let frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null =
    null;
  while (keepActive) {
    iteration++;
    console.log(`Running iteration: ${iteration} - errorCount: ${errorCount}`);
    try {
      const selectedScanTarget: SelectedScanTarget = await waitScanEvent(
        deviceCapabilities,
        registrationConfigs,
      );

      let proceedToScan = true;
      if (selectedScanTarget.event.compEventURI) {
        proceedToScan = await waitScanRequest(
          selectedScanTarget.event.compEventURI,
        );
      }

      let destination: WalkupDestination | null = null;

      if (proceedToScan) {
        destination = await tryGetDestination(selectedScanTarget.event);
      }
      if (!destination) {
        console.log(
          "No shortcut selected - Impossible to proceed with scan, skipping.",
        );
        continue;
      }

      const r = await processScanWithDestination(
        destination,
        selectedScanTarget,
        lastDuplexMode,
        lastScanTarget,
        folder,
        tempFolder,
        scanConfig,
        deviceCapabilities,
        scanCount,
        frontOfDoubleSidedScanContext,
      );

      scanCount = r.scanCount;
      frontOfDoubleSidedScanContext = r.frontOfDoubleSidedScanContext;

      lastScanTarget = selectedScanTarget;
      lastDuplexMode = r.duplexMode;
    } catch (e) {
      if (await HPApi.isAlive()) {
        console.log(e);
        errorCount++;
      } else {
        if (HPApi.isDebug()) {
          console.log(e);
        }
        deviceUp = false;
      }
    }

    if (errorCount === 50) {
      keepActive = false;
    }

    if (!deviceUp) {
      await HPApi.waitDeviceUp(deviceUpPollingInterval);
    } else {
      await delay(1000);
    }
  }
}

async function processScanWithDestination(
  destination: WalkupDestination,
  selectedScanTarget: SelectedScanTarget,
  lastDuplexMode: DuplexMode,
  lastScanTarget: SelectedScanTarget | undefined,
  folder: string,
  tempFolder: string,
  scanConfig: ScanConfig,
  deviceCapabilities: DeviceCapabilities,
  scanCount: number,
  frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null,
) {
  console.log("Selected shortcut: " + destination.shortcut);

  const { duplexMode, targetDuplexMode } = determineDuplexModes(
    destination,
    selectedScanTarget,
    lastDuplexMode,
    lastScanTarget,
  );
  if (
    lastScanTarget != null &&
    frontOfDoubleSidedScanContext != null &&
    lastScanTarget.isDuplexSingleSide && lastDuplexMode == DuplexMode.FrontOfDoubleSided &&
    (duplexMode == DuplexMode.Simplex || duplexMode == DuplexMode.Duplex)
  ) {
    await processFinishedPartialDuplexScan(
      lastScanTarget,
      selectedScanTarget,
      scanCount,
      frontOfDoubleSidedScanContext,
    );
  }

  const scanParameters = await setupScanParameters(
    duplexMode,
    targetDuplexMode,
    destination,
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
    selectedScanTarget,
    folder,
    tempFolder,
    scanCount,
    deviceCapabilities,
    scanConfig,
    targetDuplexMode == TargetDuplexMode.Duplex,
    scanToPdf,
    pageCountingStrategy,
  );

  frontOfDoubleSidedScanContext = await handleScanResult(
    duplexMode,
    frontOfDoubleSidedScanContext,
    scanConfig,
    folder,
    tempFolder,
    scanCount,
    scanJobContent,
    scanDate,
    scanToPdf,
  );
  return { scanCount, frontOfDoubleSidedScanContext, duplexMode };
}

async function handleScanResult(
  duplexMode: DuplexMode,
  frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null,
  scanConfig: ScanConfig,
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  scanToPdf: boolean,
) {
  if (duplexMode == DuplexMode.FrontOfDoubleSided) {
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
    if (duplexMode == DuplexMode.BackOfDoubleSided) {
      finalScanJobContent = assembleDuplexScan(
        frontOfDoubleSidedScanContext,
        scanJobContent,
      );
    } else {
      finalScanJobContent = scanJobContent;
    }

    await postProcessing(
      scanConfig,
      folder,
      tempFolder,
      scanCount,
      finalScanJobContent,
      scanDate,
      scanToPdf,
    );
  }
  return frontOfDoubleSidedScanContext;
}

function determineDuplexModes(
  destination: WalkupDestination,
  selectedScanTarget: SelectedScanTarget,
  previousDuplexMode: DuplexMode,
  lastScanTarget: SelectedScanTarget | undefined,
) {
  const isDuplex =
    destination.scanPlexMode != null &&
    destination.scanPlexMode != ScanPlexMode.Simplex;

  let duplexMode: DuplexMode;

  let targetDuplexMode: TargetDuplexMode;
  if (isDuplex) {
    targetDuplexMode = TargetDuplexMode.Duplex;
    duplexMode = DuplexMode.Duplex;
  } else if (selectedScanTarget.isDuplexSingleSide) {
    targetDuplexMode = TargetDuplexMode.EmulatedDuplex;
    if (
      lastScanTarget != null &&
      selectedScanTarget.resourceURI === lastScanTarget.resourceURI &&
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

function assembleEmulatedDoubleSideScan(
  previousScanContent: ScanContent,
  scanJobContent: ScanContent,
) {
  const frontContent = previousScanContent.elements;
  const backContent = scanJobContent.elements;
  const duplexScanJobContent: ScanContent = { elements: [] };
  for (let i = 0; i < Math.max(frontContent.length, backContent.length); i++) {
    if (i < frontContent.length) {
      duplexScanJobContent.elements.push(frontContent[i]);
    }
    if (i < backContent.length) {
      duplexScanJobContent.elements.push(backContent[i]);
    }
  }
  return duplexScanJobContent;
}

type ScanParameters = {
  pageCountingStrategy: PageCountingStrategy;
  scanToPdf: boolean;
  scanDate: Date;
  scanCount: number;
};

async function setupScanParameters(
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
  if (duplexMode == DuplexMode.Duplex) {
    console.log(`Destination ScanPlexMode is : ${targetDuplexMode}`);
    pageCountingStrategy = PageCountingStrategy.Normal;
    scanToPdf = isPdf(destination);
    scanDate = new Date();
    scanCount = await PathHelper.getNextScanNumber(
      folder,
      scanCount,
      scanConfig.directoryConfig.filePattern,
    );
    console.log(`Scan event captured, saving scan #${scanCount}`);
  } else if (targetDuplexMode == TargetDuplexMode.EmulatedDuplex) {
    if (duplexMode == DuplexMode.FrontOfDoubleSided) {
      console.log(`Destination ScanPlexMode is : ${targetDuplexMode}`);
      pageCountingStrategy = PageCountingStrategy.OddOnly;
      scanToPdf = isPdf(destination);
      scanDate = new Date();
      scanCount = await PathHelper.getNextScanNumber(
        folder,
        scanCount,
        scanConfig.directoryConfig.filePattern,
      );

      console.log(
        `Scan event captured, saving front sides of scan #${scanCount}`,
      );
    } else {
      console.log(`Destination ScanPlexMode is : ${targetDuplexMode}`);
      pageCountingStrategy = PageCountingStrategy.EvenOnly;
      scanToPdf =
        frontOfDoubleSidedScanContext?.scanToPdf ?? isPdf(destination);
      scanDate = frontOfDoubleSidedScanContext?.scanDate ?? new Date();
      scanCount = frontOfDoubleSidedScanContext?.scanCount ?? scanCount;
      console.log(
        `Scan event captured, saving back sides of scan #${scanCount}`,
      );
    }
  } else {
    console.log(`Destination ScanPlexMode is : ${targetDuplexMode}`);
    pageCountingStrategy = PageCountingStrategy.Normal;
    scanToPdf = isPdf(destination);
    scanDate = new Date();
    scanCount = await PathHelper.getNextScanNumber(
      folder,
      scanCount,
      scanConfig.directoryConfig.filePattern,
    );
    console.log(`Scan event captured, saving scan #${scanCount}`);
  }

  return { pageCountingStrategy, scanToPdf, scanDate, scanCount };
}

async function processFinishedPartialDuplexScan(
  lastScanTarget: SelectedScanTarget,
  selectedScanTarget: SelectedScanTarget,
  scanCount: number,
  frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext,
) {
  console.log(
    `Scan target changed from ${lastScanTarget.label} to ${selectedScanTarget.label}, saving scan #${scanCount} before processing`,
  );

  await postProcessing(
    frontOfDoubleSidedScanContext.scanConfig,
    frontOfDoubleSidedScanContext.folder,
    frontOfDoubleSidedScanContext.tempFolder,
    frontOfDoubleSidedScanContext.scanCount,
    frontOfDoubleSidedScanContext.scanJobContent,
    frontOfDoubleSidedScanContext.scanDate,
    frontOfDoubleSidedScanContext.scanToPdf,
  );
}

function assembleDuplexScan(
  frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null,
  scanJobContent: ScanContent,
) {
  console.log(
    "Emulated duplex scan completed; front and back pages are being assembled",
  );
  return assembleEmulatedDoubleSideScan(
    frontOfDoubleSidedScanContext?.scanJobContent ?? { elements: [] },
    scanJobContent,
  );
}

type FrontOfDoubleSidedScanContext = {
  scanConfig: ScanConfig;
  folder: string;
  tempFolder: string;
  scanCount: number;
  scanJobContent: ScanContent;
  scanDate: Date;
  scanToPdf: boolean;
};
