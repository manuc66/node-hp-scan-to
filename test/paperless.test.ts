import { describe, it, beforeEach } from "mocha";
import path from "node:path";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import {
  uploadImagesAsSeparateDocumentsToPaperless,
  uploadPdfToPaperless,
} from "../src/paperless/paperless.js";
import type { PaperlessConfig } from "../src/paperless/PaperlessConfig.js";
import nock from "nock";
import { fileURLToPath } from "url";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("paperless", () => {
  const paperlessUrl = "http://paperless.example.test/api/documents/post_document/";
  const authToken = "test-token";
  const fileName = "paperless_sample.jpg";
  const assetDir = path.resolve(__dirname, "./asset");
  const filePath = path.join(assetDir, fileName);

  let scanJobContent: ScanContent;
  let scanPage: ScanPage;
  let paperlessConfig: PaperlessConfig;

  beforeEach(async () => {
    nock.cleanAll();
    nock.disableNetConnect();

    if (!existsSync(assetDir)) {
      await fs.mkdir(assetDir, { recursive: true });
    }
    if (!existsSync(filePath)) {
      await fs.writeFile(filePath, "fake-jpg-content");
    }

    scanPage = {
      pageNumber: 1,
      path: filePath,
      width: 400,
      height: 300,
      xResolution: 96,
      yResolution: 96,
    };
    scanJobContent = { elements: [scanPage] };

    paperlessConfig = {
      postDocumentUrl: paperlessUrl,
      authToken: authToken,
      keepFiles: true,
      groupMultiPageScanIntoAPdf: false,
      alwaysSendAsPdfFile: false,
    };
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });




  describe("uploadPdfToPaperless", () => {
    it("should not upload if path is null", async () => {
      const scope = nock("http://paperless.example.test")
        .post("/api/documents/post_document/")
        .reply(200);

      await uploadPdfToPaperless(null, paperlessConfig);

      // scope.isDone() should be false because no request was made
      if (scope.isDone()) {
        throw new Error("Should not have made a request");
      }
      nock.cleanAll();
    });
  });

  describe("error handling", () => {
    it("should handle upload failure", async () => {
      nock("http://paperless.example.test")
        .post(/\/api\/documents\/post_document\//)
        .reply(500, "Internal Server Error");

      // Should throw now
      try {
        await uploadImagesAsSeparateDocumentsToPaperless(
          scanJobContent,
          paperlessConfig,
        );
        throw new Error("Should have thrown");
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "Should have thrown") {
          throw err;
        }
      }
    });
  });
});
