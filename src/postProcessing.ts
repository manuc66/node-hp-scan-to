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
  const detectSidecars = scanConfig.postCommandPdf !== undefined;
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
    scanConfig.postCommandPdf,
    scanConfig.postCommandTimeout,
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
  let scanDeliveredToNextcloud = false;
  let scanDeliveredToS3 = false;
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
        scanDeliveredToNextcloud = true;
      } catch (e) {
        failures.push(toFailureMessage(e));
      }
    }
    if (s3Config) {
      try {
        await uploadPdfToS3(pdfFilePath, s3Config);
        scanDeliveredToS3 = true;
      } catch (e) {
        failures.push(toFailureMessage(e));
      }
    }
  }

  // Sidecars are delivered after the scan itself: the scan is the primary
  // deliverable, and a sidecar must not get in front of it.
  const deliveredSidecars = await deliverSidecars(sidecars, scanConfig, {
    nextcloud: scanDeliveredToNextcloud,
    s3: scanDeliveredToS3,
  });

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
 * configured, or that did not receive the scan itself, simply skips its part:
 * a sidecar must never become an orphan entry on a target where the scan is
 * missing.
 *
 * Sidecar delivery is best-effort: a sidecar is an auxiliary file, so a failed
 * upload must neither fail the scan (whose delivery already succeeded) nor keep
 * the delivered scan files on disk. The failure is logged and the sidecar stays
 * on disk, unclaimed. Returns the paths that were actually delivered, so
 * cleanup only ever removes a sidecar that reached a destination.
 */
async function deliverSidecars(
  sidecars: readonly string[],
  scanConfig: ScanConfig,
  scanDeliveredTo: { nextcloud: boolean; s3: boolean },
): Promise<string[]> {
  if (sidecars.length === 0) {
    return [];
  }

  const { nextcloudConfig, s3Config } = scanConfig;
  const targets: Promise<void>[] = [];
  if (nextcloudConfig !== undefined && scanDeliveredTo.nextcloud) {
    targets.push(uploadFilesToNextcloud(sidecars, nextcloudConfig));
  }
  if (s3Config !== undefined && scanDeliveredTo.s3) {
    targets.push(uploadFilesToS3(sidecars, s3Config));
  }

  if (targets.length === 0) {
    if (nextcloudConfig === undefined && s3Config === undefined) {
      logger.warn(
        { sidecars },
        "Post-processing produced files beside the scan but no target accepts them (S3 or Nextcloud); they are kept on disk",
      );
    } else {
      logger.warn(
        { sidecars },
        "Post-processing produced files beside the scan but the scan itself was not delivered to any target that accepts them (S3 or Nextcloud); they are kept on disk",
      );
    }
    return [];
  }

  // Settled rather than all: one target failing must not leave the other
  // without a chance to run. Any failure keeps every sidecar on disk: the
  // hook's output is never thrown away without being sent somewhere.
  const results = await Promise.allSettled(targets);
  let delivered = true;
  for (const result of results) {
    if (result.status === "rejected") {
      delivered = false;
      logger.warn(
        { error: toFailureMessage(result.reason), sidecars },
        "Post-processing sidecar delivery failed; the files are kept on disk",
      );
    }
  }

  return delivered ? [...sidecars] : [];
}

/**
 * Applies the image post-processing command to the page images.
 *
 * The PDFs derived from those pages are handled separately by the PDF hook
 * (`postCommandPdf`), so each command only ever receives the file type it was
 * configured for.
 */
async function applyPostCommandToImages(
  scanConfig: ScanConfig,
  scanJobContent: ScanContent,
): Promise<void> {
  if (scanConfig.postCommandImage === undefined) {
    return;
  }

  for (const element of scanJobContent.elements) {
    await runFilePostProcessing(
      scanConfig.postCommandImage,
      element.path,
      scanConfig.postCommandTimeout,
    );
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

  // The hooks run on the pages and, for some paperless modes, on PDFs
  // generated beside them: everything the folders gain belongs to the scan.
  // Detection only runs when a hook can produce sidecars: without a
  // post-command nothing in this pipeline creates them, and files that appear
  // in the folders meanwhile (a concurrent capture in `listen`, another
  // process) must never be mistaken for scan output.
  const detectSidecars =
    scanConfig.postCommandImage !== undefined ||
    scanConfig.postCommandPdf !== undefined;
  const directories = scanDirectories(scanJobContent, [folder]);
  const before = detectSidecars
    ? await snapshotDirectories(directories)
    : new Set<string>();

  displayImageScan(scanJobContent, scanCount);
  const failures: string[] = [];

  await applyPostCommandToImages(scanConfig, scanJobContent);

  // The PDFs the paperless stage generates are named by `mergeToPdf` (after the
  // scan count or the file pattern), so only that stage knows their real paths.
  // They are collected here: a post-command may have written a sidecar beside
  // each one, and it must be recognised like any other.
  let generatedPdfPaths: string[] = [];

  if (paperlessConfig) {
    try {
      if (paperlessConfig.groupMultiPageScanIntoAPdf) {
        const pdfFilePath =
          await mergeToPdfAndUploadAsSingleDocumentToPaperless(
            folder,
            scanCount,
            scanJobContent,
            scanConfig,
            scanDate,
            paperlessConfig,
          );
        if (pdfFilePath !== null) {
          generatedPdfPaths = [pdfFilePath];
        }
      } else {
        if (paperlessConfig.alwaysSendAsPdfFile) {
          generatedPdfPaths =
            await convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless(
              scanJobContent,
              paperlessConfig,
              scanDate,
              scanConfig.postCommandPdf,
              scanConfig.postCommandTimeout,
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
  // Only files named after a file this scan owns (pages, plus the PDFs derived
  // from them) are sidecars: a file that merely appeared in the folders while
  // the pipeline ran belongs to someone else (the next scan's pages in
  // `listen`, a sync client) and is left untouched — not delivered, not
  // deleted.
  const sourcePaths = [
    ...scanJobContent.elements.map((element) => element.path),
    ...generatedPdfPaths,
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

  let scanDeliveredToNextcloud = false;
  let scanDeliveredToS3 = false;
  if (nextcloudConfig) {
    try {
      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
      scanDeliveredToNextcloud = true;
    } catch (e) {
      failures.push(toFailureMessage(e));
    }
  }
  if (s3Config) {
    try {
      await uploadImagesToS3(scanJobContent, s3Config);
      scanDeliveredToS3 = true;
    } catch (e) {
      failures.push(toFailureMessage(e));
    }
  }
  // Sidecars are delivered after the scan itself: the scan is the primary
  // deliverable, and a sidecar must not get in front of it. Only the targets
  // that actually received it are offered the sidecars.
  const deliveredSidecars = await deliverSidecars(sidecars, scanConfig, {
    nextcloud: scanDeliveredToNextcloud,
    s3: scanDeliveredToS3,
  });

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
