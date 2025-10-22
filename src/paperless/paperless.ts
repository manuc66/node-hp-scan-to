import fsSync from "fs";
import FormData from "form-data";
import axios from "axios";
import { ScanContent } from "../type/ScanContent.js";
import fs from "fs/promises";
import { convertToPdf, mergeToPdf } from "../pdfProcessing.js";
import { PaperlessConfig } from "./PaperlessConfig.js";
import { ScanConfig } from "../type/scanConfigs.js";

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
      console.log(
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
    console.log(
      `Pdf document ${pdfFilePath} has been removed from the filesystem`,
    );
  } else {
    console.log(
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
    console.log(
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

  console.log(`Start uploading to paperless: ${filePath}`);
  try {
    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Token ${authToken}`,
      },
    });

    console.log("Document successfully uploaded to paperless:", response.data);
  } catch (error) {
    console.error("Fail to upload document:", error);
  }
  fileStream.close();
}
