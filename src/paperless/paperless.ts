import fsSync from "fs";
import FormData from "form-data";
import axios from "axios";
import { ScanContent } from "../type/ScanContent";
import fs from "fs/promises";
import { convertToPdf, mergeToPdf } from "../pdfProcessing";
import { PaperlessConfig } from "./PaperlessConfig";
import { ScanConfig } from "../type/scanConfigs";
import { getLoggerForFile } from "../logger";

const logger = getLoggerForFile(__filename);

export async function uploadImagesAsSeparateDocumentsToPaperless(
  scanJobContent: ScanContent,
  paperlessConfig: PaperlessConfig,
) {
  for (let i = 0; i < scanJobContent.elements.length; ++i) {
    const filePath = scanJobContent.elements[i].path;
    await uploadToPaperless(filePath, paperlessConfig);
  }
}

export async function convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless(
  scanJobContent: ScanContent,
  paperlessConfig: PaperlessConfig,
) {
  for (let i = 0; i < scanJobContent.elements.length; ++i) {
    const pdfFilePath = await convertToPdf(
      scanJobContent.elements[i],
      !paperlessConfig.keepFiles,
    );
    if (pdfFilePath) {
      await uploadToPaperless(pdfFilePath, paperlessConfig);
      await fs.unlink(pdfFilePath);
    } else {
      logger.error(
        "Pdf generation has failed, nothing is going to be uploaded to paperless for: " +
          scanJobContent.elements[i].path,
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
  if (pdfFilePath) {
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
  if (pdfFilePath) {
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
  }
  fileStream.close();
}
