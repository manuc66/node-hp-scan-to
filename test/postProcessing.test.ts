import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { postProcessing } from "../src/postProcessing.js";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import type { PaperlessConfig } from "../src/paperless/PaperlessConfig.js";
import type { NextcloudConfig } from "../src/nextcloud/NextcloudConfig.js";
import type { S3Config } from "../src/s3/S3Config.js";
import type { WebhookConfig } from "../src/webhook/WebhookConfig.js";
import nock from "nock";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { buildScanMetadata } from "./testUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("postProcessing", () => {
  const fileName = "post_processing_sample.jpg";
  const tempFolder = path.resolve(__dirname, "./tmp");
  const assetDir = path.resolve(__dirname, "./asset");
  const filePath = path.join(assetDir, fileName);
  const paperlessUrl =
    "http://paperless.example.test/api/documents/post_document/";
  const nextcloudUrl = "https://nextcloud.example.test";

  let scanJobContent: ScanContent;
  let scanPage: ScanPage;
  let scanConfig: ScanConfig;

  beforeEach(async () => {
    nock.cleanAll();
    nock.disableNetConnect();

    if (!existsSync(tempFolder)) {
      await fs.mkdir(tempFolder, { recursive: true });
    }
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

    scanConfig = {
      directoryConfig: {
        filePattern: "scan",
        directory: tempFolder,
      },
      paperlessConfig: undefined,
      nextcloudConfig: undefined,
      s3Config: undefined,
      webhookConfig: undefined,
    } as unknown as ScanConfig;
  });

  afterEach(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    // remove generated pdf artifacts so tests stay independent
    for (const file of await fs.readdir(tempFolder)) {
      if (file.endsWith(".pdf")) {
        await fs.rm(path.join(tempFolder, file), { force: true });
      }
    }
  });

  it("should process images (no PDF, no paperless, no nextcloud)", async () => {
    await postProcessing(
      scanConfig,
      tempFolder,
      tempFolder,
      1,
      scanJobContent,
      new Date(),
      false,
    );
  });

  it("should process as PDF (no paperless, no nextcloud)", async () => {
    await postProcessing(
      scanConfig,
      tempFolder,
      tempFolder,
      1,
      scanJobContent,
      new Date(),
      true,
    );
  });

  function paperlessConfig(
    overrides?: Partial<PaperlessConfig>,
  ): PaperlessConfig {
    return {
      postDocumentUrl: paperlessUrl,
      authToken: "test-token",
      keepFiles: false,
      groupMultiPageScanIntoAPdf: false,
      alwaysSendAsPdfFile: false,
      ...overrides,
    };
  }

  function nextcloudConfig(
    overrides?: Partial<NextcloudConfig>,
  ): NextcloudConfig {
    return {
      baseUrl: nextcloudUrl,
      username: "scanner",
      password: "pa$$word",
      uploadFolder: "scan",
      keepFiles: false,
      ...overrides,
    };
  }

  function mockPaperlessSuccess(): void {
    nock("http://paperless.example.test")
      .post("/api/documents/post_document/")
      .reply(201, "1");
  }

  function mockNextcloudFolderExists(): void {
    nock(nextcloudUrl)
      .intercept("/remote.php/dav/files/scanner/scan", "PROPFIND")
      .reply(
        207,
        '<?xml version="1.0"?>\n<d:multistatus xmlns:d="DAV:"></d:multistatus>',
      );
  }

  describe("pdf delivery", () => {
    it("uploads the pdf to paperless and nextcloud then removes it on success", async () => {
      scanConfig.paperlessConfig = paperlessConfig();
      scanConfig.nextcloudConfig = nextcloudConfig();
      mockPaperlessSuccess();
      mockNextcloudFolderExists();
      nock(nextcloudUrl)
        .intercept(/\/remote\.php\/dav\/files\/scanner\/scan\/.+\.pdf$/, "PUT")
        .reply(201);

      const result = await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        scanJobContent,
        new Date(),
        true,
      );

      expect(result.uploadSucceeded).to.equal(true);
      expect(result.failures).to.deep.equal([]);
      const remaining = (await fs.readdir(tempFolder)).filter((f) =>
        f.endsWith(".pdf"),
      );
      expect(remaining).to.deep.equal([]);
    });

    it("reports the failure and keeps the pdf when paperless rejects the upload", async () => {
      scanConfig.paperlessConfig = paperlessConfig();
      nock("http://paperless.example.test")
        .post("/api/documents/post_document/")
        .reply(500, "Internal Server Error");

      const result = await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        scanJobContent,
        new Date(),
        true,
      );

      expect(result.uploadSucceeded).to.equal(false);
      expect(result.failures).to.have.lengthOf(1);
      expect(result.failures[0]).to.contain("500");
      const remaining = (await fs.readdir(tempFolder)).filter((f) =>
        f.endsWith(".pdf"),
      );
      expect(remaining).to.have.lengthOf(1);
    });

    it("succeeds without uploading when no page is available", async () => {
      scanConfig.paperlessConfig = paperlessConfig();

      const result = await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        { elements: [] },
        new Date(),
        true,
      );

      expect(result.uploadSucceeded).to.equal(true);
      expect(result.failures).to.deep.equal([]);
    });
  });

  describe("image delivery", () => {
    it("uploads separate documents to paperless and removes files when keepFiles is false", async () => {
      scanConfig.paperlessConfig = paperlessConfig();
      mockPaperlessSuccess();

      const result = await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        scanJobContent,
        new Date(),
        false,
      );

      expect(result.uploadSucceeded).to.equal(true);
      expect(result.failures).to.deep.equal([]);
      expect(existsSync(filePath)).to.equal(false);
    });

    it("groups multi-page scans into a single pdf for paperless", async () => {
      scanConfig.paperlessConfig = paperlessConfig({
        groupMultiPageScanIntoAPdf: true,
      });
      mockPaperlessSuccess();

      const result = await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        scanJobContent,
        new Date(),
        false,
      );

      expect(result.uploadSucceeded).to.equal(true);
      const remaining = (await fs.readdir(tempFolder)).filter((f) =>
        f.endsWith(".pdf"),
      );
      expect(remaining).to.deep.equal([]);
      expect(existsSync(filePath)).to.equal(false);
    });

    it("converts images to pdf before uploading when alwaysSendAsPdfFile is set", async () => {
      scanConfig.paperlessConfig = paperlessConfig({
        alwaysSendAsPdfFile: true,
      });
      mockPaperlessSuccess();

      const result = await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        scanJobContent,
        new Date(),
        false,
      );

      expect(result.uploadSucceeded).to.equal(true);
      expect(existsSync(filePath)).to.equal(false);
    });

    it("uploads images to nextcloud and removes them on success", async () => {
      scanConfig.nextcloudConfig = nextcloudConfig();
      mockNextcloudFolderExists();
      nock(nextcloudUrl)
        .intercept(/\/remote\.php\/dav\/files\/scanner\/scan\/.+\.jpg$/, "PUT")
        .reply(201);

      const result = await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        scanJobContent,
        new Date(),
        false,
      );

      expect(result.uploadSucceeded).to.equal(true);
      expect(existsSync(filePath)).to.equal(false);
    });

    it("collects one failure per failing target and keeps the files", async () => {
      scanConfig.paperlessConfig = paperlessConfig();
      scanConfig.nextcloudConfig = nextcloudConfig();
      nock("http://paperless.example.test")
        .post("/api/documents/post_document/")
        .reply(500, "Internal Server Error");
      nock(nextcloudUrl)
        .intercept("/remote.php/dav/files/scanner/scan", "PROPFIND")
        .reply(404);

      const result = await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        scanJobContent,
        new Date(),
        false,
      );

      expect(result.uploadSucceeded).to.equal(false);
      expect(result.failures).to.have.lengthOf(2);
      expect(existsSync(filePath)).to.equal(true);
    });
  });

  describe("webhook event file locations", () => {
    interface CapturedWebhookFile {
      store?: string;
      location?: unknown;
    }

    function buildS3Config(endpointUrl: string): S3Config {
      return {
        endpointUrl,
        region: "eu-west-1",
        bucket: "scans",
        accessKeyId: "test-access-key-id",
        secretAccessKey: "test-secret-access-key",
        prefix: "",
        forcePathStyle: true,
        keepFiles: true,
      };
    }

    function buildWebhookConfig(outboxDir: string): WebhookConfig {
      return {
        url: "http://hook.test/event",
        auth: "none",
        authHeader: "x-webhook-signature",
        outboxDir,
        maxAttempts: 5,
        keepFiles: true,
      };
    }

    async function runImagePostProcessingWithWebhook(
      s3Config: S3Config | undefined,
      nextcloudConfig: unknown,
      webhookConfig: WebhookConfig,
    ): Promise<CapturedWebhookFile[]> {
      let webhookFiles: CapturedWebhookFile[] = [];
      nock("http://hook.test")
        .post("/event", (body: { files: CapturedWebhookFile[] }) => {
          webhookFiles = body.files;
          return true;
        })
        .reply(200);

      scanConfig.s3Config = s3Config;
      scanConfig.nextcloudConfig =
        nextcloudConfig as ScanConfig["nextcloudConfig"];
      scanConfig.webhookConfig = webhookConfig;
      scanJobContent.meta = buildScanMetadata();

      await postProcessing(
        scanConfig,
        tempFolder,
        tempFolder,
        1,
        scanJobContent,
        new Date(),
        false,
      );
      return webhookFiles;
    }

    it("advertises the s3 location in the webhook event when the s3 upload succeeded", async () => {
      nock("http://s3-ok.test")
        .put("/scans/post_processing_sample.jpg")
        .reply(200);

      const outboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-webhook-"));
      try {
        const files = await runImagePostProcessingWithWebhook(
          buildS3Config("http://s3-ok.test"),
          undefined,
          buildWebhookConfig(outboxDir),
        );

        expect(files).to.have.length(1);
        expect(files[0].store).to.equal("s3");
        expect(files[0].location).to.deep.equal({
          bucket: "scans",
          key: "post_processing_sample.jpg",
        });
      } finally {
        await fs.rm(outboxDir, { recursive: true, force: true });
      }
    });

    it("does not advertise the s3 location in the webhook event when the s3 upload failed", async () => {
      nock("http://s3-fail.test")
        .put("/scans/post_processing_sample.jpg")
        .reply(500, "boom");

      const outboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-webhook-"));
      try {
        const files = await runImagePostProcessingWithWebhook(
          buildS3Config("http://s3-fail.test"),
          undefined,
          buildWebhookConfig(outboxDir),
        );

        expect(files).to.have.length(1);
        expect(
          files[0].store,
          "no store should be advertised when the upload failed",
        ).to.be.undefined;
        expect(
          files[0].location,
          "no location should be advertised when the upload failed",
        ).to.be.undefined;
      } finally {
        await fs.rm(outboxDir, { recursive: true, force: true });
      }
    });

    it("does not advertise the nextcloud location in the webhook event when the nextcloud upload failed", async () => {
      nock("http://nc-fail.test")
        .intercept("/remote.php/dav/files/user/scan", "PROPFIND")
        .reply(404);

      const outboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "pp-webhook-"));
      try {
        const files = await runImagePostProcessingWithWebhook(
          undefined,
          {
            baseUrl: "http://nc-fail.test",
            username: "user",
            password: "pass",
            uploadFolder: "scan",
            keepFiles: true,
          },
          buildWebhookConfig(outboxDir),
        );

        expect(files).to.have.length(1);
        expect(
          files[0].store,
          "no store should be advertised when the upload failed",
        ).to.be.undefined;
        expect(
          files[0].location,
          "no location should be advertised when the upload failed",
        ).to.be.undefined;
      } finally {
        await fs.rm(outboxDir, { recursive: true, force: true });
      }
    });
  });
});