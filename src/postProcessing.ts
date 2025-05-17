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
import fs from "fs/promises";
import { PaperlessConfig } from "./paperless/PaperlessConfig";
import { NextcloudConfig } from "./nextcloud/NextcloudConfig";
import { ScanConfig } from "./type/scanConfigs";

export async function postProcessing(
  scanConfig: ScanConfig,
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  toPdf: boolean,
) {
  if (toPdf) {
    await handlePdfPostProcessing(
      folder,
      tempFolder,
      scanCount,
      scanJobContent,
      scanDate,
      scanConfig,
    );
  } else {
    await handleImagePostProcessing(
      folder,
      scanCount,
      scanJobContent,
      scanDate,
      scanConfig,
    );
  }
}

async function handlePdfPostProcessing(
  folder: string,
  tempFolder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  scanConfig: ScanConfig,
) {
  const paperlessConfig = scanConfig.paperlessConfig;
  const nextcloudConfig = scanConfig.nextcloudConfig;

  const pdfFilePath = await mergeToPdf(
    paperlessConfig ? tempFolder : folder,
    scanCount,
    scanJobContent,
    scanConfig.directoryConfig.filePattern,
    scanDate,
    true,
  );
  if (pdfFilePath != null) {
    displayPdfScan(pdfFilePath, scanJobContent, scanCount);
    if (paperlessConfig) {
      await uploadPdfToPaperless(pdfFilePath, paperlessConfig);
    }
    if (nextcloudConfig) {
      await uploadPdfToNextcloud(pdfFilePath, nextcloudConfig);
    }
    await cleanUpFilesIfNeeded([pdfFilePath], paperlessConfig, nextcloudConfig);
  }
}

async function handleImagePostProcessing(
  folder: string,
  scanCount: number,
  scanJobContent: ScanContent,
  scanDate: Date,
  scanConfig: ScanConfig,
) {
  const paperlessConfig = scanConfig.paperlessConfig;
  const nextcloudConfig = scanConfig.nextcloudConfig;

  displayJpegScan(scanJobContent, scanCount);
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
  const filePaths = scanJobContent.elements.map((element) => element.path);
  await cleanUpFilesIfNeeded(filePaths, paperlessConfig, nextcloudConfig);
}

function displayPdfScan(
  pdfFilePath: string | null,
  scanJobContent: ScanContent,
  scanCount: number,
) {
  if (pdfFilePath === null) {
    console.log(`Pdf generated has not been generated`);
    return;
  }

  console.log(
    `The following page(s) have been rendered inside '${pdfFilePath}' as part of scan #${scanCount}: `,
  );
  scanJobContent.elements.forEach((e) =>
    console.log(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} - ${e.width}x${
        e.height
      }`,
    ),
  );
}

function displayJpegScan(scanJobContent: ScanContent, scanCount: number) {
  console.log(`The following page(s) are part of scan #${scanCount}: `);
  scanJobContent.elements.forEach((e) =>
    console.log(
      `\t- page ${e.pageNumber.toString().padStart(3, " ")} - ${e.width}x${
        e.height
      } - ${e.path}`,
    ),
  );
}

async function cleanUpFilesIfNeeded(
  filePaths: string[],
  paperlessConfig: PaperlessConfig | undefined,
  nextcloudConfig: NextcloudConfig | undefined,
) {
  const keepFiles: boolean =
    paperlessConfig?.keepFiles ?? nextcloudConfig?.keepFiles ?? true;
  if (!keepFiles) {
    await Promise.all(
      filePaths.map(async (filePath) => {
        await fs.unlink(filePath);
        console.log(`File ${filePath} has been removed from the filesystem`);
      }),
    );
  }
}
