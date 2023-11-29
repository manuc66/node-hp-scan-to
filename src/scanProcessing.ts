import Event from "./Event";
import WalkupScanDestination from "./WalkupScanDestination";
import WalkupScanToCompDestination from "./WalkupScanToCompDestination";
import HPApi from "./HPApi";
import fs from "fs/promises";
import JpegUtil from "./JpegUtil";
import { DeviceCapabilities } from "./DeviceCapabilities";
import { waitForScanEvent, waitScanRequest } from "./listening";
import ScanJobSettings from "./ScanJobSettings";
import { createPdfFrom, ScanContent, ScanPage } from "./ScanContent";
import Job from "./Job";
import { delay } from "./delay";
import PathHelper from "./PathHelper";
import ScanStatus from "./ScanStatus";
import { InputSource } from "./InputSource";

async function waitDeviceUntilItIsReadyToUploadOrCompleted(
  jobUrl: string,
): Promise<Job> {
  let job = null;
  let isReadyToUpload = false;
  do {
    job = await HPApi.getJob(jobUrl);
    if (job.jobState === "Canceled") {
      return job;
    } else if (
      job.pageState === "ReadyToUpload" ||
      job.jobState === "Completed"
    ) {
      isReadyToUpload = true;
    } else if (job.jobState == "Processing") {
      isReadyToUpload = false;
    } else {
      console.log(`Unknown jobState: ${job.jobState}`);
    }
    await delay(300);
  } while (!isReadyToUpload);
  return job;
}

async function TryGetDestination(
  event: Event,
): Promise<WalkupScanDestination | WalkupScanToCompDestination | null> {
  //this code can in some cases be executed before the user actually chooses between Document or Photo
  //so lets fetch the contentType (Document or Photo) until we get a value
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

async function scanProcessing(filePath: string): Promise<number | null> {
  const buffer: Buffer = await fs.readFile(filePath);

  let height = JpegUtil.fixSizeWithDNL(buffer);
  if (height != null) {
    // rewrite the fixed file
    await fs.writeFile(filePath, buffer);
    return height;
  }
  return null;
}

function createScanPage(
  job: Job,
  currentPageNumber: number,
  filePath: string,
  sizeFixed: number | null,
): ScanPage {
  let height = sizeFixed ?? job.imageHeight;
  return {
    path: filePath,
    pageNumber: currentPageNumber,
    width: job.imageWidth ?? 0,
    height: height ?? 0,
    xResolution: job.xResolution ?? 200,
    yResolution: job.yResolution ?? 200,
  };
}

async function handleProcessingState(
  job: Job,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  currentPageNumber: number,
  filePattern: string | undefined,
  date: Date,
): Promise<ScanPage | null> {
  if (
    job.pageState == "ReadyToUpload" &&
    job.binaryURL != null &&
    job.currentPageNumber != null
  ) {
    console.log(
      `Ready to download page job page ${job.currentPageNumber} at:`,
      job.binaryURL,
    );

    const destinationFilePath = PathHelper.getFileForPage(
      folder,
      scanCount,
      currentPageNumber,
      filePattern,
      "jpg",
      date,
    );
    const filePath = await HPApi.downloadPage(
      job.binaryURL,
      destinationFilePath,
    );
    console.log("Page downloaded to:", filePath);

    let sizeFixed: null | number = null;
    if (inputSource == InputSource.Adf) {
      sizeFixed = await scanProcessing(filePath);
      if (sizeFixed == null) {
        console.log(
          `File size has not been fixed, DNF may not have been found and approximate height is: ${job.imageHeight}`,
        );
      }
    }
    return createScanPage(job, currentPageNumber, filePath, sizeFixed);
  } else {
    console.log(`Unknown pageState: ${job.pageState}`);
    await delay(200);
    return null;
  }
}

async function executeScanJob(
  scanJobSettings: ScanJobSettings,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  filePattern: string | undefined,
): Promise<"Completed" | "Canceled"> {
  const jobUrl = await HPApi.postJob(scanJobSettings);

  console.log("New job created:", jobUrl);

  let job = await HPApi.getJob(jobUrl);
  while (job.jobState !== "Completed") {
    job = await waitDeviceUntilItIsReadyToUploadOrCompleted(jobUrl);

    if (job.jobState == "Completed") {
      continue;
    }

    if (job.jobState === "Processing") {
      const page = await handleProcessingState(
        job,
        inputSource,
        folder,
        scanCount,
        scanJobContent.elements.length + 1,
        filePattern,
        new Date(),
      );
      job = await HPApi.getJob(jobUrl);
      if (page != null && job.jobState != "Canceled") {
        scanJobContent.elements.push(page);
      }
    } else if (job.jobState === "Canceled") {
      console.log("Job cancelled by device");
      break;
    } else {
      console.log(`Unhandled jobState: ${job.jobState}`);
      await delay(200);
    }
  }
  console.log(
    `Job state: ${job.jobState}, totalPages: ${scanJobContent.elements.length}:`,
  );
  return job.jobState;
}

async function waitScanNewPageRequest(compEventURI: string): Promise<boolean> {
  let startNewScanJob = false;
  let wait = true;
  while (wait) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); //wait 1s

    let walkupScanToCompEvent =
      await HPApi.getWalkupScanToCompEvent(compEventURI);
    let message = walkupScanToCompEvent.eventType;

    if (message === "ScanNewPageRequested") {
      startNewScanJob = true;
      wait = false;
    } else if (message === "ScanPagesComplete") {
      wait = false;
    } else if (message === "ScanRequested") {
      // continue waiting
    } else {
      wait = false;
      console.log(`Unknown eventType: ${message}`);
    }
  }
  return startNewScanJob;
}

async function executeScanJobs(
  scanJobSettings: ScanJobSettings,
  inputSource: InputSource,
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  firstEvent: Event,
  deviceCapabilities: DeviceCapabilities,
  filePattern: string | undefined,
) {
  let jobState = await executeScanJob(
    scanJobSettings,
    inputSource,
    folder,
    scanCount,
    scanJobContent,
    filePattern,
  );
  let lastEvent = firstEvent;
  if (
    jobState === "Completed" &&
    lastEvent.compEventURI &&
    inputSource !== InputSource.Adf &&
    lastEvent.destinationURI &&
    deviceCapabilities.supportsMultiItemScanFromPlaten
  ) {
    lastEvent = await waitForScanEvent(
      lastEvent.destinationURI,
      lastEvent.agingStamp,
    );
    if (!lastEvent.compEventURI) {
      return;
    }
    let startNewScanJob = await waitScanNewPageRequest(lastEvent.compEventURI);
    while (startNewScanJob) {
      jobState = await executeScanJob(
        scanJobSettings,
        inputSource,
        folder,
        scanCount,
        scanJobContent,
        filePattern,
      );
      if (jobState !== "Completed") {
        return;
      }
      if (!lastEvent.destinationURI) {
        break;
      }
      lastEvent = await waitForScanEvent(
        lastEvent.destinationURI,
        lastEvent.agingStamp,
      );
      if (!lastEvent.compEventURI) {
        return;
      }
      startNewScanJob = await waitScanNewPageRequest(lastEvent.compEventURI);
    }
  }
}

async function mergeToPdf(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  filePattern: string | undefined,
  date: Date,
): Promise<string | null> {
  if (scanJobContent.elements.length > 0) {
    const pdfFilePath: string = PathHelper.getFileForScan(
      folder,
      scanCount,
      filePattern,
      "pdf",
      date,
    );
    await createPdfFrom(scanJobContent, pdfFilePath);
    scanJobContent.elements.forEach((e) => fs.unlink(e.path));
    return pdfFilePath;
  }
  console.log(`No page available to build a pdf file`);
  return null;
}

function displayPdfScan(
  pdfFilePath: string | null,
  scanJobContent: ScanContent,
) {
  if (pdfFilePath === null) {
    console.log(`Pdf generated has not been generated`);
    return;
  }
  console.log(
    `The following page(s) have been rendered inside '${pdfFilePath}': `,
  );
  scanJobContent.elements.forEach((e) =>
    console.log(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} - ${e.width}x${
        e.height
      }`,
    ),
  );
}

function displayJpegScan(scanJobContent: ScanContent) {
  scanJobContent.elements.forEach((e) =>
    console.log(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} - ${e.width}x${
        e.height
      } - ${e.path}`,
    ),
  );
}

function isPdf(
  destination: WalkupScanDestination | WalkupScanToCompDestination,
) {
  if (
    destination.shortcut === "SavePDF" ||
    destination.shortcut === "EmailPDF" ||
    destination.shortcut == "SaveDocument1"
  ) {
    return true;
  } else if (
    destination.shortcut === "SaveJPEG" ||
    destination.shortcut === "SavePhoto1"
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
) {
  if (scanConfig.width && scanConfig.width > 0) {
    const maxWidth =
      inputSource === InputSource.Adf
        ? deviceCapabilities.adfMaxWidth
        : deviceCapabilities.platenMaxWidth;

    if (maxWidth && scanConfig.width > maxWidth) {
      return maxWidth;
    } else {
      return scanConfig.width;
    }
  } else {
    return null;
  }
}

export function getScanHeight(
  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
) {
  if (scanConfig.height && scanConfig.height > 0) {
    const maxHeight =
      inputSource === InputSource.Adf
        ? deviceCapabilities.adfMaxHeight
        : deviceCapabilities.platenMaxHeight;

    if (maxHeight && scanConfig.height > maxHeight) {
      return maxHeight;
    } else {
      return scanConfig.height;
    }
  } else {
    return null;
  }
}

export async function saveScan(
  event: Event,
  folder: string,
  tempFolder: string,
  scanCount: number,
  deviceCapabilities: DeviceCapabilities,
  scanConfig: ScanConfig,
): Promise<void> {
  if (event.compEventURI) {
    const proceedToScan = await waitScanRequest(event.compEventURI);
    if (!proceedToScan) {
      return;
    }
  }

  const destination = await TryGetDestination(event);
  if (!destination) {
    console.log("No shortcut selected!");
    return;
  }
  console.log("Selected shortcut: " + destination.shortcut);

  let toPdf: boolean;
  let destinationFolder: string;
  let contentType: "Document" | "Photo";
  if (isPdf(destination)) {
    toPdf = true;
    contentType = "Document";
    destinationFolder = tempFolder;
    console.log(
      `Scan will be converted to pdf, using ${destinationFolder} as temp scan output directory for individual pages`,
    );
  } else {
    toPdf = false;
    contentType = "Photo";
    destinationFolder = folder;
  }

  const isDuplex =
    destination.scanPlexMode != null && destination.scanPlexMode != "Simplex";
  console.log("ScanPlexMode is : " + destination.scanPlexMode);

  const scanStatus = await HPApi.getScanStatus();
  console.log("Afd is : " + scanStatus.adfState);

  const inputSource = scanStatus.getInputSource();
  const scanWidth = getScanWidth(scanConfig, inputSource, deviceCapabilities);
  const scanHeight = getScanHeight(scanConfig, inputSource, deviceCapabilities);

  const scanJobSettings = new ScanJobSettings(
    inputSource,
    contentType,
    scanConfig.resolution,
    scanWidth,
    scanHeight,
    isDuplex,
  );

  const scanJobContent: ScanContent = { elements: [] };

  const scanDate = new Date();

  await executeScanJobs(
    scanJobSettings,
    inputSource,
    destinationFolder,
    scanCount,
    scanJobContent,
    event,
    deviceCapabilities,
    scanConfig.directoryConfig.filePattern,
  );

  console.log(
    `Scan of page(s) completed totalPages: ${scanJobContent.elements.length}:`,
  );

  if (toPdf) {
    const pdfFilePath = await mergeToPdf(
      folder,
      scanCount,
      scanJobContent,
      scanConfig.directoryConfig.filePattern,
      scanDate,
    );
    displayPdfScan(pdfFilePath, scanJobContent);
  } else {
    displayJpegScan(scanJobContent);
  }
}

export type DirectoryConfig = {
  directory: string | undefined;
  tempDirectory: string | undefined;
  filePattern: string | undefined;
};
export type ScanConfig = {
  resolution: number;
  width: number | null;
  height: number | null;
  directoryConfig: DirectoryConfig;
};
export type AdfAutoScanConfig = ScanConfig & {
  isDuplex: boolean;
  generatePdf: boolean;
  pollingInterval: number;
  startScanDelay: number;
};

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
  );
  const scanHeight = getScanHeight(
    adfAutoScanConfig,
    InputSource.Adf,
    deviceCapabilities,
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

  if (adfAutoScanConfig.generatePdf) {
    const pdfFilePath = await mergeToPdf(
      folder,
      scanCount,
      scanJobContent,
      adfAutoScanConfig.directoryConfig.filePattern,
      date,
    );
    displayPdfScan(pdfFilePath, scanJobContent);
  } else {
    displayJpegScan(scanJobContent);
  }
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
