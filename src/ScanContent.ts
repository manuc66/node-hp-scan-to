import fs from "fs/promises";

import { jsPDF } from "jspdf";

export interface ScanContent {
  elements: ScanPage[];
}
export interface ScanPage {
  path: string;
  pageNumber: number;
  width: number;
  height: number;
  xResolution: number;
  yResolution: number;
}

export async function createPdfFrom(
  scanContent: ScanContent,
  destination: string
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
