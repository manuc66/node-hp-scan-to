import fsSync from "node:fs";
import FormData from "form-data";
import axios from "axios";
import type { ScanContent } from "../type/ScanContent.js";
import fs from "node:fs/promises";
import { convertToPdf, mergeToPdf } from "../pdfProcessing.js";
import type { PaperlessConfig } from "./PaperlessConfig.js";
import type { ScanConfig } from "../type/scanConfigs.js";
import type { PostCommand } from "../postCommand.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

export async function uploadImagesAsSeparateDocumentsToPaperless(
  scanJobContent: ScanContent,
  paperlessConfig: PaperlessConfig,
): Promise<string[]> {
  const taskIds: string[] = [];
  for (const item of scanJobContent.elements) {
    const taskId = await uploadToPaperless(item.path, paperlessConfig);
    if (taskId !== undefined) {
      taskIds.push(taskId);
    }
  }
  return taskIds;
}

export async function convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless(
  scanJobContent: ScanContent,
  paperlessConfig: PaperlessConfig,
  scanDate?: Date,
  postCommandPdf?: PostCommand,
  postCommandTimeout?: number,
): Promise<{ pdfPaths: string[]; taskIds: string[] }> {
  // Returns the paths of the PDFs that were generated (the caller needs them
  // to recognise the sidecars a post-command wrote beside each one) and the
  // task ids Paperless returned, so the event can point at the documents.
  const pdfPaths: string[] = [];
  const taskIds: string[] = [];
  for (const item of scanJobContent.elements) {
    // The page is not deleted here: other delivery targets (Nextcloud, S3)
    // still have to read it after this stage, and the final cleanup removes it
    // once every target had its turn, following the same `keepFiles` rule.
    const pdfFilePath = await convertToPdf(
      item,
      false,
      scanDate,
      postCommandPdf,
      postCommandTimeout,
    );
    if (pdfFilePath !== null) {
      pdfPaths.push(pdfFilePath);
      const taskId = await uploadToPaperless(pdfFilePath, paperlessConfig);
      if (taskId !== undefined) {
        taskIds.push(taskId);
      }
      await fs.unlink(pdfFilePath);
    } else {
      logger.error(
        `Pdf generation has failed, nothing is going to be uploaded to paperless for: ${item.path}`,
      );
    }
  }
  return { pdfPaths, taskIds };
}

export async function mergeToPdfAndUploadAsSingleDocumentToPaperless(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanConfig: ScanConfig,
  scanDate: Date,
  paperlessConfig: PaperlessConfig,
): Promise<{ pdfPath: string | null; taskId: string | undefined }> {
  const pdfFilePath = await mergeToPdf(
    folder,
    scanCount,
    scanJobContent,
    scanConfig.directoryConfig.filePattern,
    scanDate,
    // Same reason as in `convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless`:
    // the pages are still needed by the other targets, and the final cleanup
    // deletes them according to `keepFiles`.
    false,
    scanConfig.postCommandPdf,
    scanConfig.postCommandTimeout,
  );
  let taskId: string | undefined;
  if (pdfFilePath !== null) {
    taskId = await uploadToPaperless(pdfFilePath, paperlessConfig);
    await fs.unlink(pdfFilePath);
    logger.info(
      `Pdf document ${pdfFilePath} has been removed from the filesystem`,
    );
  } else {
    logger.info(
      "Pdf generation has failed, nothing is going to be uploaded to paperless",
    );
  }
  // The path is returned even though the file was removed: it still names the
  // sidecar a post-command may have written beside it.
  return { pdfPath: pdfFilePath, taskId };
}

export async function uploadPdfToPaperless(
  pdfFilePath: string | null,
  paperlessConfig: PaperlessConfig,
): Promise<string | undefined> {
  if (pdfFilePath !== null) {
    return await uploadToPaperless(pdfFilePath, paperlessConfig);
  }
  logger.error(
    "Pdf generation has failed, nothing is going to be uploaded to paperless",
  );
  return undefined;
}

/**
 * Task id returned by Paperless when a document is accepted, or `undefined`
 * when the response carries none. The id is the handle a consumer needs to
 * follow the import (`GET /api/tasks/?task_id=...`); Paperless answers either
 * with the id as a bare JSON string or with a `{ "task_id": ... }` object
 * depending on the version.
 */
function parseTaskId(data: unknown): string | undefined {
  if (typeof data === "string") {
    const value = data.trim();
    return value === "" ? undefined : value;
  }
  if (typeof data === "object" && data !== null) {
    const taskId = (data as { task_id?: unknown }).task_id;
    if (typeof taskId === "string" && taskId.trim() !== "") {
      return taskId.trim();
    }
  }
  return undefined;
}

async function uploadToPaperless(
  filePath: string,
  paperlessConfig: PaperlessConfig,
): Promise<string | undefined> {
  const url = paperlessConfig.postDocumentUrl;

  const authToken = paperlessConfig.authToken;

  const fileStream = fsSync.createReadStream(filePath);

  const form = new FormData();
  form.append("document", fileStream);

  logger.info(`Start uploading to paperless: ${filePath}`);
  try {
    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Token ${authToken}`,
      },
    });

    logger.info(
      { status: response.status },
      "Document successfully uploaded to paperless",
    );
    return parseTaskId(response.data);
  } catch (error) {
    logger.error(error, "Fail to upload document");
    throw error;
  } finally {
    fileStream.close();
  }
}
