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
import { uploadPdfToS3, uploadImagesToS3 } from "./s3/s3.js";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { PaperlessConfig } from "./paperless/PaperlessConfig.js";
import type { NextcloudConfig } from "./nextcloud/NextcloudConfig.js";
import type { S3Config } from "./s3/S3Config.js";
import type { ScanConfig } from "./type/scanConfigs.js";
import { runFilePostProcessing } from "./filePostProcessing.js";
import {
  collectSidecarFiles,
  scanDirectories,
  snapshotDirectories,
} from "./sidecarDetection.js";
import { uploadFilesToNextcloud } from "./nextcloud/nextcloud.js";
import { uploadFilesToS3 } from "./s3/s3.js";
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
  const s3Config = scanConfig.s3Config;

  // The PDF may land in either folder, and the pages live wherever the scan
  // captured them: both are watched for files the hooks leave beside them.
  // Detection only runs when a hook can produce them: without a post-command
  // nothing in this pipeline creates sidecars, and files that appear in the
  // folders meanwhile (a concurrent capture in `listen`, another process)
  // must never be mistaken for scan output.
  const detectSidecars = scanConfig.postCommand !== undefined;
  const directories = scanDirectories(scanJobContent, [folder, tempFolder]);
  const before = detectSidecars
    ? await snapshotDirectories(directories)
    : new Set<string>();

  const pdfFilePath = await mergeToPdf(
    paperlessConfig ? tempFolder : folder,
    scanCount,
    scanJobContent,
    scanConfig.directoryConfig.filePattern,
    scanDate,
    true,
    scanConfig.postCommand,
  );

  // Collected before any upload: deliveries unlink the files they consumed.
  // Only files named after a file this scan owns are sidecars: a file that
  // merely appeared in the folders while the merge ran belongs to someone
  // else (the next scan's pages in `listen`, a sync client) and is left
  // untouched — not delivered, not deleted.
  const sourcePaths = [
    ...scanJobContent.elements.map((element) => element.path),
    ...(pdfFilePath !== null ? [pdfFilePath] : []),
  ];
  const sidecars = detectSidecars
    ? collectSidecarFiles(
        {
          before,
          knownFiles: sourcePaths,
          directories,
        },
        await snapshotDirectories(directories),
      ).filter((file) => sourcePaths.some((source) => file.startsWith(source)))
    : [];

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
    if (s3Config) {
      try {
        await uploadPdfToS3(pdfFilePath, s3Config);
      } catch (e) {
        failures.push(toFailureMessage(e));
      }
    }
  }

  // Sidecars are delivered after the scan itself: the scan is the primary
  // deliverable, and a sidecar must not get in front of it.
  const deliveredSidecars = await deliverSidecars(
    sidecars,
    scanConfig,
    failures,
  );

  // Only clean up if delivery succeeded, otherwise keep the files.
  if (failures.length === 0) {
    await cleanUpFilesIfNeeded(
      [
        ...(pdfFilePath !== null ? [pdfFilePath] : []),
        // Sidecars are only removed when they were delivered somewhere: a
        // sidecar Paperless never received must stay on disk.
        ...deliveredSidecars,
      ],
      paperlessConfig,
      nextcloudConfig,
      s3Config,
    );
  }
  return { uploadSucceeded: failures.length === 0, failures };
}

/**
 * Uploads the sidecars a hook wrote beside the scan.
 *
 * Only S3 and Nextcloud receive them: Paperless turns every upload into a
 * standalone document, and a sidecar there would be an unrelated entry in the
 * library rather than a companion of the scan. A target that was not
 * configured simply skips its part.
 *
 * Returns the paths that were actually delivered, so cleanup only ever
 * removes a sidecar that reached a destination.
 */
async function deliverSidecars(
  sidecars: readonly string[],
  scanConfig: ScanConfig,
  failures: string[],
): Promise<string[]> {
  if (sidecars.length === 0) {
    return [];
  }

  const { nextcloudConfig, s3Config } = scanConfig;
  if (nextcloudConfig === undefined && s3Config === undefined) {
    logger.debug(
      { sidecars },
      "Post-processing produced files beside the scan but no target accepts them, keeping them",
    );
    return [];
  }

  const targets: Promise<void>[] = [];
  if (nextcloudConfig) {
    targets.push(uploadFilesToNextcloud(sidecars, nextcloudConfig));
  }
  if (s3Config) {
    targets.push(uploadFilesToS3(sidecars, s3Config));
  }

  // Settled rather than all: one target failing must not leave the other
  // without a chance to run, and any failure keeps the files on disk.
  const results = await Promise.allSettled(targets);
  let delivered = true;
  for (const result of results) {
    if (result.status === "rejected") {
      delivered = false;
      failures.push(toFailureMessage(result.reason));
    }
  }

  return delivered ? [...sidecars] : [];
}

/**
 * Applies the post-processing command to delivered images, unless the only
 * delivery is a conversion to a single PDF: in that case the command already
 * runs on the generated PDF instead.
 */
async function applyPostCommandToImages(
  scanConfig: ScanConfig,
  scanJobContent: ScanContent,
): Promise<void> {
  if (scanConfig.postCommand === undefined) {
    return;
  }

  // The command already ran on the generated PDF, so the page images only
  // need it when they are delivered as images. Every other target (paperless
  // as images, nextcloud, S3) receives the images themselves.
  const imagesAreConvertedToPdf =
    scanConfig.paperlessConfig !== undefined &&
    (scanConfig.paperlessConfig.groupMultiPageScanIntoAPdf ||
      scanConfig.paperlessConfig.alwaysSendAsPdfFile);
  const pdfIsTheOnlyDelivery =
    imagesAreConvertedToPdf &&
    scanConfig.nextcloudConfig === undefined &&
    scanConfig.s3Config === undefined &&
    // With keep_files the page images stay on disk: they are kept output of
    // the scan and must go through the hook like every other kept file.
    scanConfig.paperlessConfig?.keepFiles !== true;

  if (pdfIsTheOnlyDelivery) {
    return;
  }

  for (const element of scanJobContent.elements) {
    await runFilePostProcessing(scanConfig.postCommand, element.path);
  }
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
  const s3Config = scanConfig.s3Config;

  // The hook runs on the pages (and, for some paperless modes, on PDFs
  // generated beside them): everything the folders gain belongs to the scan.
  // Detection only runs when a hook can produce them: without a post-command
  // nothing in this pipeline creates sidecars, and files that appear in the
  // folders meanwhile (a concurrent capture in `listen`, another process)
  // must never be mistaken for scan output.
  const detectSidecars = scanConfig.postCommand !== undefined;
  const directories = scanDirectories(scanJobContent, [folder]);
  const before = detectSidecars
    ? await snapshotDirectories(directories)
    : new Set<string>();

  displayImageScan(scanJobContent, scanCount);
  const failures: string[] = [];

  await applyPostCommandToImages(scanConfig, scanJobContent);

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

  // Collected after the paperless stage: the PDFs it generates run the hook
  // too, and their sidecars must travel with the scan like every other one.
  // Only files named after a file this scan owns (pages, plus the PDFs
  // derived from them) are sidecars: a file that merely appeared in the
  // folders while the pipeline ran belongs to someone else (the next scan's
  // pages in `listen`, a sync client) and is left untouched — not delivered,
  // not deleted.
  const sourcePaths = [
    ...scanJobContent.elements.map((element) => element.path),
    ...scanJobContent.elements.map((element) => {
      const ext = path.extname(element.path);
      return `${element.path.slice(0, element.path.length - ext.length)}.pdf`;
    }),
  ];
  const sidecars = detectSidecars
    ? collectSidecarFiles(
        {
          before,
          knownFiles: sourcePaths,
          directories,
        },
        await snapshotDirectories(directories),
      ).filter((file) => sourcePaths.some((source) => file.startsWith(source)))
    : [];

  if (nextcloudConfig) {
    try {
      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
    } catch (e) {
      failures.push(toFailureMessage(e));
    }
  }
  if (s3Config) {
    try {
      await uploadImagesToS3(scanJobContent, s3Config);
    } catch (e) {
      failures.push(toFailureMessage(e));
    }
  }
  // Sidecars are delivered after the scan itself: the scan is the primary
  // deliverable, and a sidecar must not get in front of it.
  const deliveredSidecars = await deliverSidecars(
    sidecars,
    scanConfig,
    failures,
  );

  // Only clean up if delivery succeeded, otherwise keep the files.
  if (failures.length === 0) {
    const filePaths = scanJobContent.elements.map((element) => element.path);
    await cleanUpFilesIfNeeded(
      // Sidecars are only removed when they were delivered somewhere: a
      // sidecar Paperless never received must stay on disk.
      [...filePaths, ...deliveredSidecars],
      paperlessConfig,
      nextcloudConfig,
      s3Config,
    );
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
  s3Config: S3Config | undefined,
) {
  const keepFiles: boolean =
    paperlessConfig?.keepFiles ??
    nextcloudConfig?.keepFiles ??
    s3Config?.keepFiles ??
    true;
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
