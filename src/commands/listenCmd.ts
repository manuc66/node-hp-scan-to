import { RegistrationConfig, SelectedScanTarget } from "../scanTargetDefinitions";
import { ScanConfig } from "scanConfigs";
import HPApi from "../HPApi";
import { readDeviceCapabilities } from "../readDeviceCapabilities";
import { DuplexMode } from "duplexMode";
import { ScanContent } from "../ScanContent";
import { waitScanEvent, waitScanRequest } from "../listening";
import { isPdf, saveScanFromEvent, tryGetDestination } from "../scanProcessing";
import { postProcessing } from "../postProcessing";
import PathHelper from "../PathHelper";
import { TargetDuplexMode } from "targetDuplexMode";
import { delay } from "../delay";
import WalkupScanDestination from "../WalkupScanDestination";
import WalkupScanToCompDestination from "../WalkupScanToCompDestination";
import { getTargetFolder, getTempFolder } from "../scanConfigUtils";

type WalkupDestination = WalkupScanDestination | WalkupScanToCompDestination;

let iteration = 0;
export async function listenCmd(
  registrationConfigs: RegistrationConfig[],
  scanConfig: ScanConfig,
  deviceUpPollingInterval: number,
) {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp(deviceUpPollingInterval);
  let deviceUp = true;

  const folder = await getTargetFolder(scanConfig.directoryConfig.directory);

  const tempFolder = await getTempFolder(
    scanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities();

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  let lastScanTarget: SelectedScanTarget | undefined = undefined;

  let lastDuplexMode: DuplexMode = DuplexMode.Simplex;

  let frontOfDoubleSidedScanContext: {
    scanConfig: ScanConfig;
    folder: string;
    tempFolder: string;
    scanCount: number;
    scanJobContent: ScanContent;
    scanDate: Date;
    scanToPdf: boolean
  } | null = null;
  while (keepActive) {
    iteration++;
    console.log(`Running iteration: ${iteration} - errorCount: ${errorCount}`);
    try {
      const selectedScanTarget = await waitScanEvent(
        deviceCapabilities,
        registrationConfigs,
      );

      if (selectedScanTarget.event.compEventURI) {
        const proceedToScan = await waitScanRequest(
          selectedScanTarget.event.compEventURI,
        );
        if (!proceedToScan) {
          return;
        }
      }

      const destination = await tryGetDestination(selectedScanTarget.event);
      if (!destination) {
        console.log("No shortcut selected!");
        return;
      }
      console.log("Selected shortcut: " + destination.shortcut);

      const { duplexMode, targetDuplexMode } = determineDuplexModes(
        destination,
        selectedScanTarget,
        lastDuplexMode,
        lastScanTarget,
      );
      if (
        lastScanTarget != null && frontOfDoubleSidedScanContext != null &&
        selectedScanTarget.isDuplexSingleSide &&
        duplexMode !== DuplexMode.BackOfDoubleSided
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

      let scanToPdf: boolean = false;
      let scanDate = new Date();
      let scanJobContent: ScanContent = { elements: [] };
      if (duplexMode == DuplexMode.Duplex) {
        console.log(`Destination ScanPlexMode is : ${targetDuplexMode}`);
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
          console.log(
            `Scan event captured, saving back sides of scan #${scanCount}`,
          );
        }
      } else {
        console.log(`Destination ScanPlexMode is : ${targetDuplexMode}`);
        scanToPdf = isPdf(destination);
        scanDate = new Date();
        scanCount = await PathHelper.getNextScanNumber(
          folder,
          scanCount,
          scanConfig.directoryConfig.filePattern,
        );
        console.log(`Scan event captured, saving scan #${scanCount}`);
      }

      const previousScanContent = scanJobContent;
      scanJobContent = await saveScanFromEvent(
        selectedScanTarget,
        folder,
        tempFolder,
        scanCount,
        deviceCapabilities,
        scanConfig,
        targetDuplexMode == TargetDuplexMode.Duplex,
        scanToPdf,
      );

      if (duplexMode == DuplexMode.FrontOfDoubleSided) {
        frontOfDoubleSidedScanContext = {
          scanConfig,
          folder,
          tempFolder,
          scanCount,
          scanJobContent,
          scanDate,
          scanToPdf,
        }
      } else {
        let finalScanJobContent: ScanContent;
        if (duplexMode == DuplexMode.BackOfDoubleSided) {
          finalScanJobContent = assembleEmulatedDoubleSideScan(
            previousScanContent,
            scanJobContent
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
          scanToPdf
        );
      }

      lastScanTarget = selectedScanTarget;
      lastDuplexMode = duplexMode;
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

function determineDuplexModes(
  destination: WalkupDestination,
  selectedScanTarget: SelectedScanTarget,
  previousDuplexMode: DuplexMode,
  lastScanTarget: SelectedScanTarget | undefined,
) {
  const isDuplex =
    destination.scanPlexMode != null && destination.scanPlexMode != "Simplex";

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