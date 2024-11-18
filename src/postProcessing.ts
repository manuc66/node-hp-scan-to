import { ScanContent } from "./ScanContent";
import { mergeToPdf } from "./pdfProcessing";
import {
  convertImagesToPdfAndUploadAsSeparateDocumentsToPaperless,
  mergeToPdfAndUploadAsSingleDocumentToPaperless,
  uploadImagesAsSeparateDocumentsToPaperless,
  uploadPdfToPaperless,
} from "./paperless/paperless";
import { ScanConfig } from "./scanProcessing";

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
