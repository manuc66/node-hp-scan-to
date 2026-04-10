import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import {
  mergeToPdf,
  convertToPdf,
  createPdfFrom,
} from "../src/pdfProcessing.js";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import path from "node:path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("pdfProcessing", () => {
  const assetDir = path.resolve(__dirname, "./asset");
  const tempDir = path.resolve(__dirname, "./tmp");
  const pdfProcessingSampleJpg = path.join(assetDir, "pdf_processing_sample.jpg");

  beforeEach(async () => {
    if (!existsSync(tempDir)) {
      await fs.mkdir(tempDir, { recursive: true });
    }
    // Ensure asset directory exists with sample.jpg
    if (!existsSync(assetDir)) {
      await fs.mkdir(assetDir, { recursive: true });
    }
    if (!existsSync(pdfProcessingSampleJpg)) {
      await fs.writeFile(pdfProcessingSampleJpg, "fake-jpg-content");
    }
  });

  describe("mergeToPdf", () => {
    it("should merge multiple pages to a single PDF", async () => {
      const page1: ScanPage = {
        pageNumber: 1,
        path: pdfProcessingSampleJpg,
        width: 800,
        height: 600,
        xResolution: 100,
        yResolution: 100,
      };
      const page2: ScanPage = {
        pageNumber: 2,
        path: pdfProcessingSampleJpg,
        width: 800,
        height: 600,
        xResolution: 100,
        yResolution: 100,
      };
      const scanContent: ScanContent = { elements: [page1, page2] };
      const date = new Date();

      const pdfPath = await mergeToPdf(
        tempDir,
        1,
        scanContent,
        "test-merge",
        date,
        false,
      );
      expect(pdfPath).to.not.be.null;
      expect(existsSync(pdfPath!)).to.be.true;

      await fs.unlink(pdfPath!);
    });

    it("should return null if no pages", async () => {
      const scanContent: ScanContent = { elements: [] };
      const pdfPath = await mergeToPdf(
        tempDir,
        1,
        scanContent,
        "test-empty",
        new Date(),
        false,
      );
      expect(pdfPath).to.be.null;
    });
  });

  describe("convertToPdf", () => {
    it("should convert a single page to PDF", async () => {
      // Copy sample to temp to avoid deleting original if deleteFile is true
      const tempJpg = path.join(tempDir, "temp-single.jpg");
      await fs.copyFile(pdfProcessingSampleJpg, tempJpg);

      const page: ScanPage = {
        pageNumber: 1,
        path: tempJpg,
        width: 800,
        height: 600,
        xResolution: 100,
        yResolution: 100,
      };

      const pdfPath = await convertToPdf(page, true);
      expect(pdfPath).to.not.be.null;
      expect(pdfPath).to.include(".pdf");
      expect(existsSync(pdfPath!)).to.be.true;
      expect(existsSync(tempJpg)).to.be.false;

      await fs.unlink(pdfPath!);
    });
  });

  describe("createPdfFrom error handling", () => {
    it("should throw error for BMP files", async () => {
      const bmpPath = path.join(tempDir, "sample.bmp");
      await fs.writeFile(bmpPath, "fake-bmp-content");

      const page: ScanPage = {
        pageNumber: 1,
        path: bmpPath,
        width: 800,
        height: 600,
        xResolution: 100,
        yResolution: 100,
      };

      try {
        await createPdfFrom(
          { elements: [page] },
          path.join(tempDir, "out.pdf"),
        );
        expect.fail("Should have thrown error");
      } catch (e: unknown) {
        expect(e).to.be.instanceOf(Error);
        expect((e as Error).message).to.contain(
          "PDF encapsulation of BMP (Raw) images is not supported",
        );
      }

      await fs.unlink(bmpPath);
    });
  });
});
