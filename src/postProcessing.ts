import type { ScanContent } from "./type/ScanContent.js";
import { mergeToPdf } from "./pdfProcessing.js";
import {
  convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless,
  mergeToPdfAndUploadAsSingleDocumentToPaperless,
  uploadImagesAsSeparateDocumentsToPaperless,
  uploadPdfToPaperless,
} from "./paperless/paperless.js";
import {
  uploadPdfToNextcloud,
  uploadImagesToNextcloud,
} from "./nextcloud/nextcloud.js";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import type { PaperlessConfig } from "./paperless/PaperlessConfig.js";
import type { NextcloudConfig } from "./nextcloud/NextcloudConfig.js";
import type { ScanConfig } from "./type/scanConfigs.js";
import { runFilePostProcessing } from "./filePostProcessing.js";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

export interface PostProcessingResult {
  uploadSucceeded: boolean;
  failures: string[];
}

function toFailureMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function postProcessing(
  scanConfig: ScanConfig,
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  toPdf: boolean,
): Promise<PostProcessingResult> {
  if (toPdf) {
    return await handlePdfPostProcessing(
      folder,
      tempFolder,
      scanCount,
      scanJobContent,
      scanDate,
      scanConfig,
    );
  }
  return await handleImagePostProcessing(
    folder,
    scanCount,
    scanJobContent,
    scanDate,
    scanConfig,
  );
}

async function handlePdfPostProcessing(
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  scanConfig: ScanConfig,
): Promise<PostProcessingResult> {
  const paperlessConfig = scanConfig.paperlessConfig;
  const nextcloudConfig = scanConfig.nextcloudConfig;

  const pdfFilePath = await mergeToPdf(
    paperlessConfig ? tempFolder : folder,
    scanCount,
    scanJobContent,
    scanConfig.directoryConfig.filePattern,
    scanDate,
    true,
    scanConfig.postCommand,
  );
  const failures: string[] = [];
  if (pdfFilePath !== null) {
    displayPdfScan(pdfFilePath, scanJobContent, scanCount);
    if (paperlessConfig) {
      try {
        await uploadPdfToPaperless(pdfFilePath, paperlessConfig);
      } catch (e) {
        failures.push(toFailureMessage(e));
      }
    }
    if (nextcloudConfig) {
      try {
        await uploadPdfToNextcloud(pdfFilePath, nextcloudConfig);
      } catch (e) {
        failures.push(toFailureMessage(e));
      }
    }
    // Only clean up if delivery succeeded, otherwise keep the files.
    if (failures.length === 0) {
      await cleanUpFilesIfNeeded(
        [pdfFilePath],
        paperlessConfig,
        nextcloudConfig,
      );
    }
  }
  return { uploadSucceeded: failures.length === 0, failures };
}

async function handleImagePostProcessing(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  scanConfig: ScanConfig,
): Promise<PostProcessingResult> {
  const paperlessConfig = scanConfig.paperlessConfig;
  const nextcloudConfig = scanConfig.nextcloudConfig;

  displayImageScan(scanJobContent, scanCount);
  const failures: string[] = [];

  // Only apply the post-processing command to files that are delivered as
  // images: when the only delivery is a conversion to PDF, the command
  // already runs on the generated PDF instead.
  const pdfConversionOnly =
    paperlessConfig !== undefined &&
    nextcloudConfig === undefined &&
    (paperlessConfig.groupMultiPageScanIntoAPdf ||
      paperlessConfig.alwaysSendAsPdfFile);
  if (!pdfConversionOnly && scanConfig.postCommand !== undefined) {
    for (const element of scanJobContent.elements) {
      await runFilePostProcessing(scanConfig.postCommand, element.path);
    }
  }

  if (paperlessConfig) {
    try {
      if (paperlessConfig.groupMultiPageScanIntoAPdf) {
        await mergeToPdfAndUploadAsSingleDocumentToPaperless(
          folder,
          scanCount,
          scanJobContent,
          scanConfig,
          scanDate,
          paperlessConfig,
        );
      } else {
        if (paperlessConfig.alwaysSendAsPdfFile) {
          await convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless(
            scanJobContent,
            paperlessConfig,
            scanDate,
            scanConfig.postCommand,
          );
        } else {
          await uploadImagesAsSeparateDocumentsToPaperless(
            scanJobContent,
            paperlessConfig,
          );
        }
      }
    } catch (e) {
      failures.push(toFailureMessage(e));
    }
  }
  if (nextcloudConfig) {
    try {
      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
    } catch (e) {
      failures.push(toFailureMessage(e));
    }
  }
  // Only clean up if delivery succeeded, otherwise keep the files.
  if (failures.length === 0) {
    const filePaths = scanJobContent.elements.map((element) => element.path);
    await cleanUpFilesIfNeeded(filePaths, paperlessConfig, nextcloudConfig);
  }
  return { uploadSucceeded: failures.length === 0, failures };
}

function displayPdfScan(
  pdfFilePath: string | null,
  scanJobContent: ScanContent,
  scanCount: number,
) {
  if (pdfFilePath === null) {
    logger.warn(`Pdf generated has not been generated`);
    return;
  }

  logger.info(
    `Scan #${scanCount} saved as PDF: ${pdfFilePath} with the following pages:`,
  );
  scanJobContent.elements.forEach((e) =>
    logger.info(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} | ${e.width}x${
        e.height
      } | (temp file deleted ${e.path})`,
    ),
  );
}

function displayImageScan(scanJobContent: ScanContent, scanCount: number) {
  logger.info(`Scan #${scanCount} completed with the following pages:`);
  scanJobContent.elements.forEach((e) =>
    logger.info(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} | ${e.width}x${
        e.height
      } | ${e.path}`,
    ),
  );
}

async function cleanUpFilesIfNeeded(
  filePaths: string[],
  paperlessConfig: PaperlessConfig | undefined,
  nextcloudConfig: NextcloudConfig | undefined,
) {
  const keepFiles: boolean =
    paperlessConfig?.keepFiles ?? nextcloudConfig?.keepFiles ?? true;
  if (!keepFiles) {
    await Promise.all(
      filePaths.map(async (filePath) => {
        if (existsSync(filePath)) {
          await fs.unlink(filePath);
          logger.info(`File ${filePath} has been removed from the filesystem`);
        } else {
          logger.warn(
            `File ${filePath} was already removed from the filesystem`,
          );
        }
      }),
    );
  }
}
