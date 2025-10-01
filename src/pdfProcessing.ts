import { ScanContent, ScanPage } from "./type/ScanContent";
import PathHelper from "./PathHelper";
import fs from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";

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
    await createPdfFrom(scanJobContent, pdfFilePath);
    if (deleteFiles) {
      await Promise.all(scanJobContent.elements.map((e) => fs.unlink(e.path)));
    }
    return pdfFilePath;
  }
  console.log(`No page available to build a pdf file`);
  return null;
}

export async function convertToPdf(
  scanPage: ScanPage,
  deleteFile: boolean,
): Promise<string | null> {
  const fileName = path.basename(scanPage.path, path.extname(scanPage.path));
  const pdfFilePath = path.join(path.dirname(scanPage.path), `${fileName}.pdf`);

  await createPdfFrom({ elements: [scanPage] }, pdfFilePath);
  if (deleteFile) {
    await fs.unlink(scanPage.path);
  }
  return pdfFilePath;
}

export async function createPdfFrom(
  scanContent: ScanContent,
  destination: string,
) {
  let doc: jsPDF | null = null;
  for (const element of scanContent.elements) {
    const widthInInches = element.width / element.xResolution;
    const heightInInches = element.height / element.yResolution;
    const format = [widthInInches, heightInInches];

    if (doc == null) {
      doc = new jsPDF({ unit: "in", floatPrecision: 3, format });
    } else {
      doc.addPage(format);
    }

    const imageByteBuffer = await fs.readFile(element.path);
    doc.addImage(imageByteBuffer, "JPEG", 0, 0, widthInInches, heightInInches);
  }
  doc?.save(destination);
}
