import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
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
  const paperlessUrl =
    "http://paperless.example.test/api/documents/post_document/";
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

  describe("upload references", () => {
    it("returns the task id when paperless answers with a plain id", async () => {
      nock("http://paperless.example.test")
        .post("/api/documents/post_document/")
        .reply(200, "e0d4a3d0-1111-2222-3333-444455556666");

      const taskId = await uploadPdfToPaperless(filePath, paperlessConfig);

      expect(taskId).to.equal("e0d4a3d0-1111-2222-3333-444455556666");
    });

    it("returns the task id when paperless answers with a task_id object", async () => {
      nock("http://paperless.example.test")
        .post("/api/documents/post_document/")
        .reply(200, { task_id: "7b1f-42" });

      const taskId = await uploadPdfToPaperless(filePath, paperlessConfig);

      expect(taskId).to.equal("7b1f-42");
    });

    it("returns no reference when the answer carries none", async () => {
      nock("http://paperless.example.test")
        .post("/api/documents/post_document/")
        .reply(200, "");

      const taskId = await uploadPdfToPaperless(filePath, paperlessConfig);

      expect(taskId).to.equal(undefined);
    });

    it("returns one task id per uploaded image", async () => {
      const secondPage: ScanPage = {
        ...scanPage,
        pageNumber: 2,
        path: path.join(assetDir, "paperless_sample_2.jpg"),
      };
      await fs.writeFile(secondPage.path, "fake-jpg-content-2");
      scanJobContent.elements.push(secondPage);

      nock("http://paperless.example.test")
        .post("/api/documents/post_document/")
        .reply(200, "task-1")
        .post("/api/documents/post_document/")
        .reply(200, "task-2");

      const taskIds = await uploadImagesAsSeparateDocumentsToPaperless(
        scanJobContent,
        paperlessConfig,
      );

      expect(taskIds).to.deep.equal(["task-1", "task-2"]);
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
