import axios from "axios";
import { createHash, createHmac, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import type { ScanContent } from "../type/ScanContent.js";
import type { ScanMetadata } from "../type/ScanMetadata.js";
import type { WebhookConfig } from "./WebhookConfig.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

const EVENT_TYPE = "scan-completed";
const EVENT_DELIVERY_FAILED = "scan-delivery-failed";

export interface WebhookFileDescriptor {
  name: string;
  path: string;
  size: number;
  sha256: string;
  format: string;
  contentType?: string;
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
  pages: unknown[];
  files: WebhookFileDescriptor[];
  /** Outcome of every delivery attempt (paperless/nextcloud/s3/pdf...). */
  delivery: WebhookDeliveryTarget[];
}

export interface EnqueuedEventFile {
  id: string;
  eventType: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  /** Raw payload body as sent (kept byte-for-byte for retries). */
  payload: WebhookEvent;
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function signPayload(body: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function outboxEntryPath(outboxDir: string, id: string): string {
  return path.join(outboxDir, `${id}.json`);
}

function deadLetterPath(outboxDir: string, id: string): string {
  return path.join(outboxDir, `${id}.failed.json`);
}

async function readOutboxEntry(
  filePath: string,
): Promise<EnqueuedEventFile | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as EnqueuedEventFile;
  } catch (e) {
    logger.error(e, `Failed to read outbox entry ${filePath}, skipping it`);
    return null;
  }
}

async function atomicallyWrite(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, content, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function enqueueEvent(
  webhookConfig: WebhookConfig,
  payload: WebhookEvent,
): Promise<string> {
  const entry: EnqueuedEventFile = {
    id: payload.id,
    eventType: payload.type,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
    payload,
  };
  await atomicallyWrite(
    outboxEntryPath(webhookConfig.outboxDir, payload.id),
    JSON.stringify(entry),
  );
  return payload.id;
}

/**
 * Sends the event once. Returns "success", "dead-letter" or "retry".
 * "success": 2xx (and other non-error statuses). "dead-letter": permanent 4xx
 * (except 429/408 which are transient). "retry": 408/429/5xx, timeout or
 * network failure — the entry stays in the outbox for a later attempt.
 */
async function deliverEvent(
  webhookConfig: WebhookConfig,
  entry: EnqueuedEventFile,
): Promise<"success" | "dead-letter" | "retry"> {
  const body = Buffer.from(JSON.stringify(entry.payload), "utf8");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "node-hp-scan-to",
    "idempotency-key": entry.id,
  };
  if (webhookConfig.secret !== undefined) {
    headers["x-webhook-signature"] = signPayload(body, webhookConfig.secret);
  }

  try {
    // validateStatus accepts every status so 429/408/5xx can be inspected
    // instead of being thrown as errors (and dead-lettered by mistake).
    const response = await axios({
      method: "POST",
      url: webhookConfig.url,
      headers,
      data: body,
      timeout: 10_000,
      validateStatus: () => true,
    });
    const status = response.status;
    if (status >= 200 && status < 300) {
      logger.info(`Webhook acknowledged event ${entry.id}`);
      return "success";
    }
    if (status === 408 || status === 429 || status >= 500) {
      logger.warn(
        `Webhook responded ${status}, event will be retried`,
      );
      return "retry";
    }
    logger.warn(
      `Webhook rejected event ${entry.id} with ${status}, dead-lettering it`,
    );
    return "dead-letter";
  } catch (error) {
    logger.error(error, `Webhook delivery failed for event ${entry.id}`);
    return "retry";
  }
}

async function removeOutboxEntry(outboxDir: string, id: string): Promise<void> {
  await fs.rm(outboxEntryPath(outboxDir, id), { force: true });
}

async function deadLetterEntry(
  outboxDir: string,
  id: string,
  reason: string,
): Promise<void> {
  try {
    const entryPath = outboxEntryPath(outboxDir, id);
    const failedPath = deadLetterPath(outboxDir, id);
    if (existsSync(entryPath)) {
      const content = await fs.readFile(entryPath, "utf8");
      await fs.writeFile(
        failedPath,
        JSON.stringify({ ...JSON.parse(content), deadLetteredWith: reason }),
        "utf8",
      );
      await fs.rm(entryPath, { force: true });
    }
    logger.warn(`Event ${id} has been dead-lettered (${reason})`);
  } catch (e) {
    logger.error(e, `Failed to dead-letter event ${id}`);
  }
}

/**
 * Attempts delivery of every pending outbox entry (skipping those scheduled
 * for a later retry) and cleans up / dead-letters them as appropriate.
 * Called at startup and after each scan so events survive restarts.
 */
export async function flushOutbox(
  webhookConfig: WebhookConfig,
): Promise<void> {
  let entries: string[];
  try {
    await fs.mkdir(webhookConfig.outboxDir, { recursive: true });
    entries = await fs.readdir(webhookConfig.outboxDir);
  } catch (e) {
    logger.error(e, "Failed to list outbox directory");
    return;
  }

  const now = Date.now();
  for (const fileName of entries) {
    if (!fileName.endsWith(".json") || fileName.endsWith(".failed.json")) {
      continue;
    }
    const filePath = path.join(webhookConfig.outboxDir, fileName);
    const entry = await readOutboxEntry(filePath);
    if (entry === null) {
      continue;
    }
    if (Date.parse(entry.nextAttemptAt) > now) {
      continue;
    }

    const outcome = await deliverEvent(webhookConfig, entry);
    if (outcome === "success") {
      await removeOutboxEntry(webhookConfig.outboxDir, entry.id);
      continue;
    }
    if (outcome === "dead-letter") {
      await deadLetterEntry(
        webhookConfig.outboxDir,
        entry.id,
        "permanent rejection",
      );
      continue;
    }

    entry.attempts += 1;
    if (entry.attempts >= webhookConfig.maxAttempts) {
      await deadLetterEntry(
        webhookConfig.outboxDir,
        entry.id,
        `too many attempts (${entry.attempts})`,
      );
      continue;
    }
    entry.nextAttemptAt = new Date(
      now + entry.attempts * 30_000,
    ).toISOString();
    await atomicallyWrite(filePath, JSON.stringify(entry));
  }
}

/**
 * Builds the scan event, persists it in the outbox (write-ahead) and tries to
 * deliver it immediately. On failure the entry stays pending and is retried by
 * a later flushOutbox call.
 */
export async function sendScanEvent(
  scanContent: ScanContent,
  files: { path: string; contentType?: string }[],
  delivery: WebhookDeliveryTarget[],
  webhookConfig: WebhookConfig,
): Promise<void> {
  if (scanContent.meta === undefined) {
    return;
  }

  const deliveryFailed = delivery.some((d) => d.status === "failed");
  const fileDescriptors: WebhookFileDescriptor[] = [];
  for (const file of files) {
    const buffer = await fs.readFile(file.path);
    fileDescriptors.push({
      name: path.basename(file.path),
      path: file.path,
      size: buffer.length,
      sha256: sha256Hex(buffer),
      format: path.extname(file.path).replace(/^\./, ""),
      ...(file.contentType !== undefined
        ? { contentType: file.contentType }
        : {}),
    });
  }

  const events: WebhookEvent = {
    id: randomUUID(),
    type: deliveryFailed ? EVENT_DELIVERY_FAILED : EVENT_TYPE,
    time: new Date().toISOString(),
    metadata: scanContent.meta,
    pages: [],
    delivery,
    files: fileDescriptors,
  };

  const id = await enqueueEvent(webhookConfig, events);
  await flushOutbox(webhookConfig);
  void id;
}