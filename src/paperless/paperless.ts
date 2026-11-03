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
) {
  for (const item of scanJobContent.elements) {
    const filePath = item.path;
    await uploadToPaperless(filePath, paperlessConfig);
  }
}

export async function convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless(
  scanJobContent: ScanContent,
  paperlessConfig: PaperlessConfig,
  scanDate?: Date,
  postCommandPdf?: PostCommand,
  postCommandTimeout?: number,
): Promise<string[]> {
  // Returns the paths of the PDFs that were generated: the caller needs them
  // to recognise the sidecars a post-command wrote beside each one.
  const generatedPdfPaths: string[] = [];
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
      generatedPdfPaths.push(pdfFilePath);
      await uploadToPaperless(pdfFilePath, paperlessConfig);
      await fs.unlink(pdfFilePath);
    } else {
      logger.error(
        `Pdf generation has failed, nothing is going to be uploaded to paperless for: ${item.path}`,
      );
    }
  }
  return generatedPdfPaths;
}

export async function mergeToPdfAndUploadAsSingleDocumentToPaperless(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanConfig: ScanConfig,
  scanDate: Date,
  paperlessConfig: PaperlessConfig,
): Promise<string | null> {
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
  if (pdfFilePath !== null) {
    await uploadToPaperless(pdfFilePath, paperlessConfig);
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
  return pdfFilePath;
}

export async function uploadPdfToPaperless(
  pdfFilePath: string | null,
  paperlessConfig: PaperlessConfig,
) {
  if (pdfFilePath !== null) {
    await uploadToPaperless(pdfFilePath, paperlessConfig);
  } else {
    logger.error(
      "Pdf generation has failed, nothing is going to be uploaded to paperless",
    );
  }
}

async function uploadToPaperless(
  filePath: string,
  paperlessConfig: PaperlessConfig,
): Promise<void> {
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
  } catch (error) {
    logger.error(error, "Fail to upload document");
    throw error;
  }
  fileStream.close();
}
