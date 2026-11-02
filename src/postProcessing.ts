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
  nextcloudWebdavFileUrl,
} from "./nextcloud/nextcloud.js";
import { uploadPdfToS3, uploadImagesToS3, s3ObjectLocation } from "./s3/s3.js";
import {
  sendScanEvent,
  type WebhookDeliveryTarget,
  type WebhookFileSource,
} from "./webhook/webhook.js";
import type { WebhookConfig } from "./webhook/WebhookConfig.js";
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

/**
 * Notify the webhook without letting a failure abort the rest of the
 * post-processing: an unreachable endpoint or a rejected signature must not
 * stop metadata logging or the cleanup of the scanned files.
 */
async function notifyWebhook(
  scanJobContent: ScanContent,
  files: WebhookFileSource[],
  delivery: WebhookDeliveryTarget[],
  webhookConfig: WebhookConfig,
): Promise<void> {
  try {
    await sendScanEvent(scanJobContent, files, delivery, webhookConfig);
  } catch (e) {
    logger.warn(e, "Failed to send the scan webhook event, continuing");
  }
}

/**
 * Runs one delivery target and records its outcome for the webhook event.
 *
 * Returns whether the target succeeded: the sidecar stage only offers files to
 * a target that actually received the scan, so the caller needs the answer.
 */
async function recordDelivery(
  delivery: WebhookDeliveryTarget[],
  failures: string[],
  target: string,
  action: () => Promise<void>,
): Promise<boolean> {
  try {
    await action();
    delivery.push({ target, status: "success", error: undefined });
    return true;
  } catch (e) {
    const message = toFailureMessage(e);
    failures.push(message);
    delivery.push({ target, status: "failed", error: message });
    return false;
  }
}

function buildWebhookFileSource(
  file: { path: string; contentType?: string },
  s3Config: S3Config | undefined,
  nextcloudConfig: NextcloudConfig | undefined,
): WebhookFileSource {
  const source: WebhookFileSource = { path: file.path };
  if (file.contentType !== undefined) {
    source.contentType = file.contentType;
  }
  if (s3Config) {
    source.store = "s3";
    source.location = s3ObjectLocation(s3Config, path.basename(file.path));
  } else if (nextcloudConfig) {
    source.store = "nextcloud";
    source.location = {
      webdavUrl: nextcloudWebdavFileUrl(
        nextcloudConfig,
        path.basename(file.path),
      ),
    };
  }
  return source;
}

/**
 * Builds the per-file descriptors for a scanned image set: one descriptor per
 * delivered image, with the store location (S3/Nextcloud) when configured.
 */
function webhookFileSourcesForImages(
  scanJobContent: ScanContent,
  s3Config: S3Config | undefined,
  nextcloudConfig: NextcloudConfig | undefined,
): WebhookFileSource[] {
  return scanJobContent.elements.map((element) =>
    buildWebhookFileSource(
      {
        path: element.path,
        ...(element.contentType !== undefined
          ? { contentType: element.contentType }
          : {}),
      },
      s3Config,
      nextcloudConfig,
    ),
  );
}

/**
 * Builds the single file descriptor for a generated PDF (when one exists),
 * with the store location (S3/Nextcloud) when configured.
 */
function webhookFileSourcesForPdf(
  pdfFilePath: string | null,
  s3Config: S3Config | undefined,
  nextcloudConfig: NextcloudConfig | undefined,
): WebhookFileSource[] {
  return pdfFilePath === null
    ? []
    : [
        buildWebhookFileSource(
          { path: pdfFilePath, contentType: "application/pdf" },
          s3Config,
          nextcloudConfig,
        ),
      ];
}

/**
 * Reports the configured-but-skipped delivery targets after a failed PDF
 * generation, so the consumer can tell a "never attempted" target from a
 * failed one.
 */
function reportConfiguredButSkippedTargets(
  delivery: WebhookDeliveryTarget[],
  paperlessConfig: PaperlessConfig | undefined,
  nextcloudConfig: NextcloudConfig | undefined,
  s3Config: S3Config | undefined,
): void {
  for (const target of ["paperless", "nextcloud", "s3"] as const) {
    const configured =
      (target === "paperless" && paperlessConfig !== undefined) ||
      (target === "nextcloud" && nextcloudConfig !== undefined) ||
      (target === "s3" && s3Config !== undefined);
    if (configured) {
      delivery.push({
        target,
        status: "failed",
        error: "Skipped: PDF generation failed",
      });
    }
  }
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
  const webhookConfig = scanConfig.webhookConfig;

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
  const delivery: WebhookDeliveryTarget[] = [];
  let scanDeliveredToNextcloud = false;
  let scanDeliveredToS3 = false;
  if (pdfFilePath !== null) {
    delivery.push({ target: "pdf", status: "success", error: undefined });
    displayPdfScan(pdfFilePath, scanJobContent, scanCount);
    if (paperlessConfig) {
      await recordDelivery(delivery, failures, "paperless", () =>
        uploadPdfToPaperless(pdfFilePath, paperlessConfig),
      );
    }
    if (nextcloudConfig) {
      scanDeliveredToNextcloud = await recordDelivery(
        delivery,
        failures,
        "nextcloud",
        () => uploadPdfToNextcloud(pdfFilePath, nextcloudConfig),
      );
    }
    if (s3Config) {
      scanDeliveredToS3 = await recordDelivery(
        delivery,
        failures,
        "s3",
        () => uploadPdfToS3(pdfFilePath, s3Config),
      );
    }
  } else {
    delivery.push({
      target: "pdf",
      status: "failed",
      error: "PDF generation failed, nothing was uploaded",
    });
    // Report the configured-but-skipped targets so the consumer can tell a
    // "never attempted" target from a failed one.
    reportConfiguredButSkippedTargets(
      delivery,
      paperlessConfig,
      nextcloudConfig,
      s3Config,
    );
  }

  // Sidecars are delivered after the scan itself: the scan is the primary
  // deliverable, and a sidecar must not get in front of it.
  const deliveredSidecars = await deliverSidecars(sidecars, scanConfig, {
    nextcloud: scanDeliveredToNextcloud,
    s3: scanDeliveredToS3,
  });

  // The event describes the files as they were delivered, so it is sent once
  // every target had its turn and before the cleanup removes anything.
  if (webhookConfig) {
    await notifyWebhook(
      scanJobContent,
      webhookFileSourcesForPdf(pdfFilePath, s3Config, nextcloudConfig),
      delivery,
      webhookConfig,
    );
  }
  await logScanMetadata(scanJobContent, scanDate);

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
      webhookConfig,
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
  const webhookConfig = scanConfig.webhookConfig;

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
  const delivery: WebhookDeliveryTarget[] = [];

  await applyPostCommandToImages(scanConfig, scanJobContent);

  // The PDFs the paperless stage generates are named by `mergeToPdf` (after the
  // scan count or the file pattern), so only that stage knows their real paths.
  // They are collected here: a post-command may have written a sidecar beside
  // each one, and it must be recognised like any other.
  let generatedPdfPaths: string[] = [];

  if (paperlessConfig) {
    // Kept as one closure so the delivery recorder sees a single paperless
    // outcome while the generated PDF paths still reach the sidecar scan.
    await recordDelivery(delivery, failures, "paperless", async () => {
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
      } else if (paperlessConfig.alwaysSendAsPdfFile) {
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
    });
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
    scanDeliveredToNextcloud = await recordDelivery(
      delivery,
      failures,
      "nextcloud",
      () => uploadImagesToNextcloud(scanJobContent, nextcloudConfig),
    );
  }
  if (s3Config) {
    scanDeliveredToS3 = await recordDelivery(delivery, failures, "s3", () =>
      uploadImagesToS3(scanJobContent, s3Config),
    );
  }
  // Sidecars are delivered after the scan itself: the scan is the primary
  // deliverable, and a sidecar must not get in front of it. Only the targets
  // that actually received it are offered the sidecars.
  const deliveredSidecars = await deliverSidecars(sidecars, scanConfig, {
    nextcloud: scanDeliveredToNextcloud,
    s3: scanDeliveredToS3,
  });

  // The event describes the files as they were delivered, so it is sent once
  // every target had its turn and before the cleanup removes anything.
  if (webhookConfig) {
    await notifyWebhook(
      scanJobContent,
      webhookFileSourcesForImages(scanJobContent, s3Config, nextcloudConfig),
      delivery,
      webhookConfig,
    );
  }
  await logScanMetadata(scanJobContent, scanDate);

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
      webhookConfig,
    );
  }
  return { uploadSucceeded: failures.length === 0, failures };
}

async function logScanMetadata(
  scanJobContent: ScanContent,
  scanDate: Date,
): Promise<void> {
  const meta = scanJobContent.meta;
  if (meta === undefined) {
    return;
  }
  const pages = await Promise.all(
    scanJobContent.elements.map(async (element) => {
      let sizeBytes: number | undefined;
      try {
        sizeBytes = (await fs.stat(element.path)).size;
      } catch {
        sizeBytes = undefined;
      }
      return {
        pageNumber: element.pageNumber,
        path: element.path,
        format: path.extname(element.path).replace(/^\./, ""),
        width: element.width,
        height: element.height,
        xResolution: element.xResolution,
        yResolution: element.yResolution,
        sizeBytes,
        capturedAt: element.capturedAt,
        durationMs: element.durationMs,
        contentType: element.contentType,
      };
    }),
  );
  logger.info(
    {
      metadata: {
        ...meta,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - scanDate.getTime(),
      },
      pages,
    },
    "Scan completed",
  );
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
  webhookConfig: WebhookConfig | undefined,
) {
  const keepFiles: boolean =
    paperlessConfig?.keepFiles ??
    nextcloudConfig?.keepFiles ??
    s3Config?.keepFiles ??
    webhookConfig?.keepFiles ??
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
