import type { ScanContent, ScanPage } from "./type/ScanContent.js";
import PathHelper from "./PathHelper.js";
import fs from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
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
  let doc: jsPDF | null = null;
  for (const element of scanContent.elements) {
    const widthInInches = element.width / element.xResolution;
    const heightInInches = element.height / element.yResolution;
    const format = [widthInInches, heightInInches];

    if (doc === null) {
      doc = new jsPDF({ unit: "in", floatPrecision: 3, format });
      if (date !== undefined) {
        doc.setCreationDate(date);
        doc.setFileId(dateToFileId(date));
      }
    } else {
      doc.addPage(format);
    }

    if (element.path.toLowerCase().endsWith(".bmp")) {
      throw new Error(
        "PDF encapsulation of BMP (Raw) images is not supported directly without conversion. Please use Jpeg format for PDF or keep scans as individual BMP files.",
      );
    }
    const imageByteBuffer = await fs.readFile(element.path);
    doc.addImage(imageByteBuffer, "JPEG", 0, 0, widthInInches, heightInInches);

    // jspdf work is synchronous in-process CPU: give the event loop a window
    // between pages so pending requests (printer polls, health checks) are
    // handled even while a large scan is being merged.
    await yieldToEventLoop();
  }
  doc?.save(destination);
  await yieldToEventLoop();
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function dateToFileId(date: Date): string {
  return date.getTime().toString(16).padStart(32, "0");
}
