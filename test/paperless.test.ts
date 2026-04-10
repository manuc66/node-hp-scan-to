import { describe, it, beforeEach, afterEach } from "mocha";
import path from "node:path";
import {
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
  const paperlessUrl = "http://localhost/api/documents/post_document/";
  const authToken = "test-token";
  const fileName = "paperless_sample.jpg";
  const assetDir = path.resolve(__dirname, "./asset");
  const filePath = path.join(assetDir, fileName);


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
      const scope = nock("http://localhost")
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
});
