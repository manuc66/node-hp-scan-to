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
 * post-processing: a broken outbox (disk full, unwritable dir) must not stop
 * metadata logging or the cleanup of the scanned files.
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

async function recordDelivery(
  delivery: WebhookDeliveryTarget[],
  failures: string[],
  target: string,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
    delivery.push({ target, status: "success", error: undefined });
  } catch (e) {
    const message = toFailureMessage(e);
    failures.push(message);
    delivery.push({ target, status: "failed", error: message });
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

  const pdfFilePath = await mergeToPdf(
    paperlessConfig ? tempFolder : folder,
    scanCount,
    scanJobContent,
    scanConfig.directoryConfig.filePattern,
    scanDate,
    true,
  );
  const failures: string[] = [];
  const delivery: WebhookDeliveryTarget[] = [];
  if (pdfFilePath !== null) {
    delivery.push({ target: "pdf", status: "success", error: undefined });
    displayPdfScan(pdfFilePath, scanJobContent, scanCount);
    if (paperlessConfig) {
      await recordDelivery(delivery, failures, "paperless", () =>
        uploadPdfToPaperless(pdfFilePath, paperlessConfig),
      );
    }
    if (nextcloudConfig) {
      await recordDelivery(delivery, failures, "nextcloud", () =>
        uploadPdfToNextcloud(pdfFilePath, nextcloudConfig),
      );
    }
    if (s3Config) {
      await recordDelivery(delivery, failures, "s3", () =>
        uploadPdfToS3(pdfFilePath, s3Config),
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
    for (const target of ["paperless", "nextcloud", "s3"] as const) {
      if (
        (target === "paperless" && paperlessConfig) ||
        (target === "nextcloud" && nextcloudConfig) ||
        (target === "s3" && s3Config)
      ) {
        delivery.push({
          target,
          status: "failed",
          error: "Skipped: PDF generation failed",
        });
      }
    }
  }
  if (webhookConfig) {
    await notifyWebhook(
      scanJobContent,
      pdfFilePath !== null
        ? [
            buildWebhookFileSource(
              { path: pdfFilePath, contentType: "application/pdf" },
              s3Config,
              nextcloudConfig,
            ),
          ]
        : [],
      delivery,
      webhookConfig,
    );
  }
  await logScanMetadata(scanJobContent, scanDate);
  // Only clean up if delivery succeeded, otherwise keep the files.
  if (failures.length === 0 && pdfFilePath !== null) {
    await cleanUpFilesIfNeeded(
      [pdfFilePath],
      paperlessConfig,
      nextcloudConfig,
      s3Config,
      webhookConfig,
    );
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
  const s3Config = scanConfig.s3Config;
  const webhookConfig = scanConfig.webhookConfig;

  displayImageScan(scanJobContent, scanCount);
  const failures: string[] = [];
  const delivery: WebhookDeliveryTarget[] = [];
  if (paperlessConfig) {
    await recordDelivery(delivery, failures, "paperless", () =>
      handlePaperlessImageDelivery(
        folder,
        scanCount,
        scanJobContent,
        scanConfig,
        scanDate,
        paperlessConfig,
      ),
    );
  }
  if (nextcloudConfig) {
    await recordDelivery(delivery, failures, "nextcloud", () =>
      uploadImagesToNextcloud(scanJobContent, nextcloudConfig),
    );
  }
  if (s3Config) {
    await recordDelivery(delivery, failures, "s3", () =>
      uploadImagesToS3(scanJobContent, s3Config),
    );
  }
  if (webhookConfig) {
    await notifyWebhook(
      scanJobContent,
      scanJobContent.elements.map((element) =>
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
      ),
      delivery,
      webhookConfig,
    );
  }
  await logScanMetadata(scanJobContent, scanDate);
  // Only clean up if delivery succeeded, otherwise keep the files.
  if (failures.length === 0) {
    const filePaths = scanJobContent.elements.map((element) => element.path);
    await cleanUpFilesIfNeeded(
      filePaths,
      paperlessConfig,
      nextcloudConfig,
      s3Config,
      webhookConfig,
    );
  }
  return { uploadSucceeded: failures.length === 0, failures };
}

async function handlePaperlessImageDelivery(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanConfig: ScanConfig,
  scanDate: Date,
  paperlessConfig: PaperlessConfig,
): Promise<void> {
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
      );
    } else {
      await uploadImagesAsSeparateDocumentsToPaperless(
        scanJobContent,
        paperlessConfig,
      );
    }
  }
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
