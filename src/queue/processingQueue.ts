import { postProcessing, type PostProcessingResult } from "../postProcessing.js";
import type { ScanConfig } from "../type/scanConfigs.js";
import type { ScanContent } from "../type/ScanContent.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

/**
 * A fully captured scan ready to be post-processed. The capture side builds
 * one of these and drops it into the processing queue instead of awaiting the
 * (potentially long) delivery work, so the scan loop stays responsive.
 */
export interface ScanProcessingJob {
  scanConfig: ScanConfig;
  folder: string;
  tempFolder: string;
  scanCount: number;
  scanJobContent: ScanContent;
  scanDate: Date;
  toPdf: boolean;
}

/**
 * In-memory FIFO queue of scans awaiting post-processing, drained by a single
 * background consumer so every scan is processed in the order it was captured.
 */
const pendingJobs: ScanProcessingJob[] = [];

let drain: Promise<void> | null = null;

/**
 * Drops a captured scan into the queue and returns immediately: the scan loop
 * is not blocked by the delivery work. This is the tacked seam where a durable
 * inbox replaces the in-memory array later on.
 */
export function enqueueScanProcessing(job: ScanProcessingJob): void {
  pendingJobs.push(job);
  drain ??= drainQueue().finally(() => {
    drain = null;
  });
}

async function drainQueue(): Promise<void> {
  while (pendingJobs.length > 0) {
    const job = pendingJobs.shift();
    if (job === undefined) {
      break;
    }
    try {
      await processScanProcessingJob(job);
    } catch (e) {
      // A failing job must not stop the other scans waiting in the queue.
      logger.error(e, `Scan processing failed for scan #${job.scanCount}`);
    }
  }
}

/**
 * Runs the whole post-processing pipeline for a single job and waits for it.
 * Used by `single-scan`, whose contract is to exit only once delivery
 * completed (successful or not).
 */
export async function processScanProcessingJob(
  job: ScanProcessingJob,
): Promise<PostProcessingResult> {
  return postProcessing(
    job.scanConfig,
    job.folder,
    job.tempFolder,
    job.scanCount,
    job.scanJobContent,
    job.scanDate,
    job.toPdf,
  );
}

/**
 * Resolves once every enqueued job has been processed. Mainly for tests and
 * for shutting down cleanly behind a long-running loop.
 */
export async function flushScanProcessingQueue(): Promise<void> {
  while (drain !== null) {
    await drain;
  }
}