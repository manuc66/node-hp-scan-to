import axios from "axios";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ScanContent } from "../type/ScanContent.js";
import type { ScanMetadata } from "../type/ScanMetadata.js";
import type { WebhookConfig } from "./WebhookConfig.js";
import { assertWebhookAuthCredentials } from "./WebhookConfig.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

const EVENT_TYPE = "scan-completed";
const EVENT_DELIVERY_FAILED = "scan-delivery-failed";

export interface WebhookFileLocation {
  /** S3 bucket (when store is "s3"). */
  bucket?: string;
  /** S3 object key (when store is "s3"). */
  key?: string;
  /** WebDAV URL of the file (when store is "nextcloud"). */
  webdavUrl?: string;
}

export interface WebhookFileDescriptor {
  name: string;
  /** Local path, only present when the file is stored locally (may be cleaned up later). */
  path?: string;
  size: number;
  sha256: string;
  format: string;
  contentType?: string;
  /** Where the file actually lives: "local" (only path), "s3" or "nextcloud". */
  store?: "local" | "s3" | "nextcloud";
  /** How to reach the object (always set when store is not "local"). */
  location?: WebhookFileLocation;
}

export interface WebhookFileSource {
  path: string;
  contentType?: string;
  store?: "local" | "s3" | "nextcloud";
  location?: WebhookFileLocation;
}

export interface WebhookDeliveryTarget {
  target: string;
  status: "success" | "failed";
  error: string | undefined;
}

export interface WebhookEvent {
  id: string;
  type: string;
  time: string;
  metadata: ScanMetadata;
  pages: WebhookPageDescriptor[];
  files: WebhookFileDescriptor[];
  /** Outcome of every delivery attempt (paperless/nextcloud/s3/pdf...). */
  delivery: WebhookDeliveryTarget[];
}

export interface WebhookPageDescriptor {
  /** 1-based page position in the scan (interleaved for emulated duplex). */
  pageNumber: number;
  format: string;
  width: number;
  height: number;
  xResolution: number;
  yResolution: number;
  /** File size in bytes when it could be read (local path may be cleaned up). */
  sizeBytes?: number;
}

/**
 * Size and SHA-256 of a delivered file, read in chunks.
 *
 * The file is never loaded whole: a merged multi-page scan is easily tens of
 * megabytes, and hashing it with a single read would spike the resident memory
 * of a small host (a Raspberry Pi, a container with a modest limit) on every
 * scan.
 */
async function fileDigest(
  filePath: string,
): Promise<{ size: number; sha256: string }> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(filePath)) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    hash.update(buffer);
  }
  return { size, sha256: hash.digest("hex") };
}

/**
 * Fallback MIME type from the file extension, used when the device did not
 * report a content type (PDFs and locally generated images).
 */
function inferContentType(filePath: string): string | undefined {
  switch (path.extname(filePath).replace(/^\./, "").toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "pdf":
      return "application/pdf";
    default:
      return undefined;
  }
}

function signPayload(body: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function applyAuth(
  webhookConfig: WebhookConfig,
  body: Buffer,
  headers: Record<string, string>,
): void {
  assertWebhookAuthCredentials(webhookConfig);
  if (webhookConfig.auth === "hmac" && webhookConfig.secret !== undefined) {
    headers[webhookConfig.authHeader] = signPayload(body, webhookConfig.secret);
    return;
  }
  if (webhookConfig.auth === "bearer" && webhookConfig.token !== undefined) {
    headers["authorization"] = `Bearer ${webhookConfig.token}`;
    return;
  }
  if (
    webhookConfig.auth === "basic" &&
    webhookConfig.username !== undefined &&
    webhookConfig.password !== undefined
  ) {
    const credentials = `${webhookConfig.username}:${webhookConfig.password}`;
    headers["authorization"] = `Basic ${Buffer.from(credentials).toString("base64")}`;
  }
}

/**
 * Best-effort delivery: a single POST, logged on failure, nothing persisted.
 */
async function deliverBestEffort(
  webhookConfig: WebhookConfig,
  payload: WebhookEvent,
): Promise<void> {
  try {
    const status = await sendEventOnce(webhookConfig, payload.id, payload);
    if (status >= 200 && status < 300) {
      logger.info(`Webhook acknowledged event ${payload.id}`);
    } else {
      logger.warn(`Webhook responded ${status} for event ${payload.id}`);
    }
  } catch (error) {
    logger.error(error, `Webhook delivery failed for event ${payload.id}`);
  }
}

/**
 * Performs the POST. Redirects are not followed: following a 301/302 would
 * downgrade the POST to an empty GET (follow-redirects), silently losing the
 * payload while the final 2xx still acknowledged delivery. Returns the HTTP
 * status, or throws on a network/timeout failure.
 */
async function sendEventOnce(
  webhookConfig: WebhookConfig,
  eventId: string,
  payload: WebhookEvent,
): Promise<number> {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "node-hp-scan-to",
    "idempotency-key": eventId,
  };
  applyAuth(webhookConfig, body, headers);

  // validateStatus accepts every status so 429/408/5xx can be inspected
  // instead of being thrown as errors (and dead-lettered by mistake).
  const response = await axios({
    method: "POST",
    url: webhookConfig.url,
    headers,
    data: body,
    timeout: 10_000,
    maxRedirects: 0,
    validateStatus: () => true,
  });
  return response.status;
}

/**
 * One descriptor per scanned page. ADF pages are not necessarily the same
 * size, so the consumer can rely on these to analyse the document without
 * re-reading the files. The local path is intentionally not exposed.
 */
async function buildPageDescriptors(
  scanContent: ScanContent,
): Promise<WebhookPageDescriptor[]> {
  return Promise.all(
    scanContent.elements.map(async (element) => {
      let sizeBytes: number | undefined;
      try {
        sizeBytes = (await fs.stat(element.path)).size;
      } catch {
        sizeBytes = undefined;
      }
      return {
        pageNumber: element.pageNumber,
        format: path.extname(element.path).replace(/^\./, ""),
        width: element.width,
        height: element.height,
        xResolution: element.xResolution,
        yResolution: element.yResolution,
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      };
    }),
  );
}

/**
 * Builds the scan event and delivers it once, best-effort: a failure is
 * reported to the caller and nothing is kept for a later retry (the durable
 * outbox is a separate, opt-in feature).
 */
export async function sendScanEvent(
  scanContent: ScanContent,
  files: WebhookFileSource[],
  delivery: WebhookDeliveryTarget[],
  webhookConfig: WebhookConfig,
): Promise<void> {
  if (scanContent.meta === undefined) {
    return;
  }
  // Fail loudly on an invalid auth config instead of silently retrying a
  // request that can never authenticate.
  assertWebhookAuthCredentials(webhookConfig);

  const deliveryFailed = delivery.some((d) => d.status === "failed");
  const fileDescriptors: WebhookFileDescriptor[] = [];
  for (const file of files) {
    const { size, sha256 } = await fileDigest(file.path);
    const contentType = file.contentType ?? inferContentType(file.path);
    const remote = file.store === "s3" || file.store === "nextcloud";
    fileDescriptors.push({
      name: path.basename(file.path),
      ...(remote ? {} : { path: file.path }),
      size,
      sha256,
      format: path.extname(file.path).replace(/^\./, ""),
      ...(contentType !== undefined ? { contentType } : {}),
      ...(file.store !== undefined ? { store: file.store } : {}),
      ...(file.location !== undefined ? { location: file.location } : {}),
    });
  }

  const pageDescriptors = await buildPageDescriptors(scanContent);

  const events: WebhookEvent = {
    id: randomUUID(),
    type: deliveryFailed ? EVENT_DELIVERY_FAILED : EVENT_TYPE,
    time: new Date().toISOString(),
    metadata: {
      ...scanContent.meta,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - new Date(scanContent.meta.startedAt).getTime(),
    },
    pages: pageDescriptors,
    delivery,
    files: fileDescriptors,
  };

  await deliverBestEffort(webhookConfig, events);
}