import fsSync from "node:fs";
import FormData from "form-data";
import axios from "axios";
import type { ScanContent } from "../type/ScanContent.js";
import fs from "node:fs/promises";
import { convertToPdf, mergeToPdf } from "../pdfProcessing.js";
import type { PaperlessConfig } from "./PaperlessConfig.js";
import type { ScanConfig } from "../type/scanConfigs.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(__filename);

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
) {
  for (const item of scanJobContent.elements) {
    const pdfFilePath = await convertToPdf(item, !paperlessConfig.keepFiles);
    if (pdfFilePath !== null) {
      await uploadToPaperless(pdfFilePath, paperlessConfig);
      await fs.unlink(pdfFilePath);
    } else {
      logger.error(
        `Pdf generation has failed, nothing is going to be uploaded to paperless for: ${item.path}`,
      );
    }
  }
}

export async function mergeToPdfAndUploadAsSingleDocumentToPaperless(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanConfig: ScanConfig,
  scanDate: Date,
  paperlessConfig: PaperlessConfig,
) {
  const pdfFilePath = await mergeToPdf(
    folder,
    scanCount,
    scanJobContent,
    scanConfig.directoryConfig.filePattern,
    scanDate,
    !paperlessConfig.keepFiles,
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

    logger.info(response.data, "Document successfully uploaded to paperless");
  } catch (error) {
    logger.error(error, "Fail to upload document");
    throw error;
  }
  fileStream.close();
}
