import type { ScanContent, ScanPage } from "./type/ScanContent.js";
import PathHelper from "./PathHelper.js";
import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

export async function mergeToPdf(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  filePattern: string | undefined,
  date: Date,
  deleteFiles: boolean,
): Promise<string | null> {
  if (scanJobContent.elements.length > 0) {
    const pdfFilePath: string = await PathHelper.getFileForScan(
      folder,
      scanCount,
      filePattern,
      "pdf",
      date,
    );
    await createPdfFrom(scanJobContent, pdfFilePath, date);
    if (deleteFiles) {
      await Promise.all(scanJobContent.elements.map((e) => fs.unlink(e.path)));
    }
    return pdfFilePath;
  }
  logger.warn(`No page available to build a pdf file`);
  return null;
}

export async function convertToPdf(
  scanPage: ScanPage,
  deleteFile: boolean,
  date?: Date,
): Promise<string | null> {
  const fileName = path.basename(scanPage.path, path.extname(scanPage.path));
  const pdfFilePath = path.join(path.dirname(scanPage.path), `${fileName}.pdf`);

  await createPdfFrom({ elements: [scanPage] }, pdfFilePath, date);
  if (deleteFile) {
    await fs.unlink(scanPage.path);
  }
  return pdfFilePath;
}

export async function createPdfFrom(
  scanContent: ScanContent,
  destination: string,
  date?: Date,
) {
  await runPdfMerge({
    pages: scanContent.elements,
    destination,
    date: date?.toISOString(),
  });
}

interface PdfMergeJobInput {
  pages: ScanPage[];
  destination: string;
  date: string | undefined;
}

type PdfMergeWorkerOutcome =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Builds the PDF in a worker thread: jspdf works synchronously in-process, so
 * merging a large scan on the main thread would starve the event loop and
 * freeze health checks and printer HTTP responses while it runs.
 */
function runPdfMerge(job: PdfMergeJobInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const inSource = import.meta.url.endsWith(".ts");
    const workerUrl = new URL(
      inSource ? "./pdfMergeWorker.ts" : "./pdfMergeWorker.js",
      import.meta.url,
    );
    const worker = new Worker(workerUrl, {
      // Propagate the tsx loader when running from the source tree (dev/tests);
      // plain node loads the compiled worker from dist in production.
      execArgv: inSource ? [...process.execArgv] : [],
    });
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      action();
      void worker.terminate();
    };
    worker.once("message", (message: PdfMergeWorkerOutcome) => {
      finish(() =>
        message.ok ? resolve() : reject(new Error(message.error)),
      );
    });
    worker.once("error", (error: Error) => {
      finish(() => reject(error));
    });
    worker.postMessage(job);
  });
}
