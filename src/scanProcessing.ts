import Event from "./Event";
import WalkupScanDestination from "./WalkupScanDestination";
import WalkupScanToCompDestination from "./WalkupScanToCompDestination";
import HPApi from "./HPApi";
import { DeviceCapabilities } from "./DeviceCapabilities";
import ScanJobSettings from "./ScanJobSettings";
import { ScanContent } from "./ScanContent";
import { delay } from "./delay";
import ScanStatus from "./ScanStatus";
import { InputSource } from "./InputSource";
import { postProcessing } from "./postProcessing";
import { SelectedScanTarget } from "./scanTargetDefinitions";
import { executeScanJob, executeScanJobs } from "./scanJobHandlers";
import { KnownShortcut } from "./type/KnownShortcut";
import { AdfAutoScanConfig, ScanConfig, SingleScanConfig } from "./type/scanConfigs";



export async function tryGetDestination(
  event: Event,
): Promise<WalkupScanDestination | WalkupScanToCompDestination | null> {
  // this code can in some cases be executed before the user actually chooses between Document or Photo
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
      console.log(`No destination URI found`);
    }

    console.log(`No shortcut yet available, attempt: ${i + 1}/20`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s
  }

  console.log("Failing to detect destination shortcut");
  console.log(JSON.stringify(destination));
  return null;
}


export function isPdf(
  destination: WalkupScanDestination | WalkupScanToCompDestination,
) {
  if (
    destination.shortcut ===  KnownShortcut.SavePDF ||
    destination.shortcut ===  KnownShortcut.EmailPDF ||
    destination.shortcut ==  KnownShortcut.SaveDocument1
  ) {
    return true;
  } else if (
    destination.shortcut ===  KnownShortcut.SaveJPEG ||
    destination.shortcut ===  KnownShortcut.SavePhoto1
  ) {
    return false;
  } else {
    console.log(
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
  isPdf: boolean
): Promise<ScanContent> {

  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  if (isPdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    console.log(
      `Scan will be converted to pdf, using ${destinationFolder} as temp scan output directory for individual pages`,
    );
  } else {
    contentType = "Photo";
    destinationFolder = folder;
  }

  const scanStatus = await HPApi.getScanStatus();

  if (scanStatus.scannerState !== "Idle") {
    console.log("Scanner state is not Idle, aborting scan attempt...!");
  }

  console.log("Afd is : " + scanStatus.adfState);

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

  const scanJobSettings = new ScanJobSettings(
    inputSource,
    contentType,
    scanConfig.resolution,
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
    scanConfig.directoryConfig.filePattern,
  );

  console.log(
    `Scan of page(s) completed totalPages: ${scanJobContent.elements.length}:`,
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
    console.log(
      `Scan will be converted to pdf, using ${destinationFolder} as temp scan output directory for individual pages`,
    );
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

  const scanJobSettings = new ScanJobSettings(
    InputSource.Adf,
    contentType,
    adfAutoScanConfig.resolution,
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
) {
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  if (scanConfig.generatePdf) {
    contentType = "Document";
    destinationFolder = tempFolder;
    console.log(
      `Scan will be converted to pdf, using ${destinationFolder} as temp scan output directory for individual pages`,
    );
  } else {
    contentType = "Photo";
    destinationFolder = folder;
  }

  const scanStatus = await HPApi.getScanStatus();

  if (scanStatus.scannerState !== "Idle") {
    console.log("Scanner state is not Idle, aborting scan attempt...!");
  }

  console.log("Afd is : " + scanStatus.adfState);

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

  const scanJobSettings = new ScanJobSettings(
    inputSource,
    contentType,
    scanConfig.resolution,
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
) {
  let ready = false;
  while (!ready) {
    let scanStatus: ScanStatus = await HPApi.getScanStatus();
    while (!scanStatus.isLoaded()) {
      await delay(pollingInterval);
      scanStatus = await HPApi.getScanStatus();
    }
    console.log(`ADF load detected`);

    let loaded = true;
    let counter = 0;
    const shortPollingInterval = 500;
    while (loaded && counter < startScanDelay) {
      await delay(shortPollingInterval);
      scanStatus = await HPApi.getScanStatus();
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
