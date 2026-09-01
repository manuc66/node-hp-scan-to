import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import { postProcessing } from "../src/postProcessing.js";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
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

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
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
        expect(files[0].location, "no location should be advertised when the upload failed")
          .to.be.undefined;
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
        expect(files[0].location, "no location should be advertised when the upload failed")
          .to.be.undefined;
      } finally {
        await fs.rm(outboxDir, { recursive: true, force: true });
      }
    });
  });
});
