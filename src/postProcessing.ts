import { ScanContent } from "./ScanContent";
import { mergeToPdf } from "./pdfProcessing";
import {
  convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless,
  mergeToPdfAndUploadAsSingleDocumentToPaperless,
  uploadImagesAsSeparateDocumentsToPaperless,
  uploadPdfToPaperless,
} from "./paperless/paperless";
import {
  uploadPdfToNextcloud,
  uploadImagesToNextcloud,
} from "./nextcloud/nextcloud";
import { ScanConfig } from "./scanProcessing";
import fs from "fs/promises";

export async function postProcessing(
  scanConfig: ScanConfig,
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  toPdf: boolean,
) {
  const paperlessConfig = scanConfig.paperlessConfig;
  const nextcloudConfig = scanConfig.nextcloudConfig;
  if (toPdf) {
    const pdfFilePath = await mergeToPdf(
      paperlessConfig ? tempFolder : folder,
      scanCount,
      scanJobContent,
      scanConfig.directoryConfig.filePattern,
      scanDate,
      true,
    );
    displayPdfScan(pdfFilePath, scanJobContent);
    if (paperlessConfig) {
      await uploadPdfToPaperless(pdfFilePath, paperlessConfig);
    }
    if (nextcloudConfig) {
      await uploadPdfToNextcloud(pdfFilePath, nextcloudConfig);
    }
    if (
      !paperlessConfig?.keepFiles &&
      !nextcloudConfig?.keepFiles &&
      pdfFilePath
    ) {
      await fs.unlink(pdfFilePath);
      console.log(
        `Pdf document ${pdfFilePath} has been removed from the filesystem`,
      );
    }
  } else {
    displayJpegScan(scanJobContent);
    if (paperlessConfig) {
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
          );
        } else {
          await uploadImagesAsSeparateDocumentsToPaperless(
            scanJobContent,
            paperlessConfig,
          );
        }
      }
    }
    if (nextcloudConfig) {
      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
    }
    if (!paperlessConfig?.keepFiles && !nextcloudConfig?.keepFiles) {
      scanJobContent.elements.map(async (element) => {
        const { path: filePath } = element;
        await fs.unlink(filePath);
        console.log(
          `Image document ${filePath} has been removed from the filesystem`,
        );
      });
    }
  }
}

function displayPdfScan(
  pdfFilePath: string | null,
  scanJobContent: ScanContent,
) {
  if (pdfFilePath === null) {
    console.log(`Pdf generated has not been generated`);
    return;
  }
  console.log(
    `The following page(s) have been rendered inside '${pdfFilePath}': `,
  );
  scanJobContent.elements.forEach((e) =>
    console.log(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} - ${e.width}x${
        e.height
      }`,
    ),
  );
}

function displayJpegScan(scanJobContent: ScanContent) {
  scanJobContent.elements.forEach((e) =>
    console.log(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} - ${e.width}x${
        e.height
      } - ${e.path}`,
    ),
  );
}
