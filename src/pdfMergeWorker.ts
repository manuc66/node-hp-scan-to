import { parentPort, type MessagePort } from "node:worker_threads";
import fs from "node:fs/promises";
import { jsPDF } from "jspdf";

export interface PdfMergePage {
  path: string;
  width: number;
  height: number;
  xResolution: number;
  yResolution: number;
}

export interface PdfMergeJob {
  pages: PdfMergePage[];
  destination: string;
  /** ISO 8601 creation date of the scan (undefined keeps jspdf defaults). */
  date: string | undefined;
}

export interface PdfMergeOutcomeOk {
  ok: true;
}

export interface PdfMergeOutcomeError {
  ok: false;
  error: string;
}

export type PdfMergeOutcome = PdfMergeOutcomeOk | PdfMergeOutcomeError;

const port = parentPort;
if (port === null) {
  throw new Error("pdfMergeWorker must be run as a worker thread");
}

async function buildPdf(job: PdfMergeJob): Promise<void> {
  const date = job.date === undefined ? undefined : new Date(job.date);
  let doc: jsPDF | null = null;
  for (const element of job.pages) {
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
  }
  doc?.save(job.destination);
}

function dateToFileId(date: Date): string {
  return date.getTime().toString(16).padStart(32, "0");
}

port.on("message", (job: PdfMergeJob) => {
  void respondToJob(port, job);
});

async function respondToJob(
  port: MessagePort,
  job: PdfMergeJob,
): Promise<void> {
  try {
    await buildPdf(job);
    port.postMessage({ ok: true } satisfies PdfMergeOutcomeOk);
  } catch (e) {
    port.postMessage({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    } satisfies PdfMergeOutcomeError);
  }
}