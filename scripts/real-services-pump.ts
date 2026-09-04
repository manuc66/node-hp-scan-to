// Drives the real delivery modules against real services started by
// docker-compose.test.yml (MinIO, Nextcloud, Paperless-ngx, n8n).
//
// Usage (from the repo root):
//   npx tsx scripts/real-services-pump.ts
//
// Reads the same environment variables the CLI would use; see
// scripts/real-services-test.sh which exports them. Exits non-zero on the
// first failed delivery. Prints the produced artifact names so the
// verification script can look them up on each service.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "url";
import { convertToPdf } from "../src/pdfProcessing.js";
import { uploadPdfToPaperless } from "../src/paperless/paperless.js";
import type { PaperlessConfig } from "../src/paperless/PaperlessConfig.js";
import { uploadPdfToNextcloud } from "../src/nextcloud/nextcloud.js";
import type { NextcloudConfig } from "../src/nextcloud/NextcloudConfig.js";
import { uploadPdfToS3 } from "../src/s3/s3.js";
import type { S3Config } from "../src/s3/S3Config.js";
import { sendScanEvent } from "../src/webhook/webhook.js";
import type { WebhookConfig } from "../src/webhook/WebhookConfig.js";
import type { ScanContent } from "../src/type/ScanContent.js";
import { InputSource } from "../src/type/InputSource.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";
import { ScanMode } from "../src/type/scanMode.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`missing required env var ${name}`);
  }
  return value;
}

async function makeSamplePdf(dir: string): Promise<string> {
  const page = {
    pageNumber: 1,
    path: path.join(dir, "sample.jpg"),
    width: 300,
    height: 200,
    xResolution: 100,
    yResolution: 100,
  };
  await fs.writeFile(
    page.path,
    Buffer.from(
      "ffd8ffe000104a46494600010100000100010000ffd9",
      "hex",
    ),
  );
  const pdf = await convertToPdf(page, false, new Date());
  if (pdf === null) {
    throw new Error("failed to build the sample PDF");
  }
  return pdf;
}

function buildScanContent(startedAt: Date): ScanContent {
  return {
    elements: [],
    meta: {
      command: "single-scan",
      scanCount: 1,
      device: { ip: "fake-scanner", isEscl: false },
      target: undefined,
      settings: {
        inputSource: InputSource.Adf,
        contentType: "Document",
        format: "pdf",
        sourceFormat: "jpg",
        mode: ScanMode.Gray,
        colorDepth: 8,
        channels: 1,
        resolution: 200,
        width: null,
        height: null,
        isDuplex: false,
        pageCountingStrategy: PageCountingStrategy.Normal,
        filePattern: undefined,
        paperSize: undefined,
        paperDim: undefined,
        paperOrientation: undefined,
      },
      startedAt: startedAt.toISOString(),
      instance: {
        id: "real-services-pump",
        startedAt: startedAt.toISOString(),
        uptimeMs: 0,
      },
    },
  };
}

const work = await fs.mkdtemp(path.join(os.tmpdir(), "real-services-"));
const pdfPath = await makeSamplePdf(work);
const fileName = path.basename(pdfPath);
console.log(`ARTIFACT=${fileName}`);
console.log(`ARTIFACT_PATH=${pdfPath}`);

const s3Config: S3Config = {
  endpointUrl: requireEnv("S3_URL"),
  region: process.env["S3_REGION"] ?? "us-east-1",
  bucket: requireEnv("S3_BUCKET"),
  accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
  secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
  prefix: process.env["S3_PREFIX"] ?? "",
  forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "1",
  keepFiles: true,
};
if (process.env["S3_SESSION_TOKEN"]) {
  s3Config.sessionToken = process.env["S3_SESSION_TOKEN"];
}
await uploadPdfToS3(pdfPath, s3Config);
console.log("uploadPdfToS3: OK");

const nextcloudConfig: NextcloudConfig = {
  baseUrl: requireEnv("NEXTCLOUD_URL"),
  username: requireEnv("NEXTCLOUD_USERNAME"),
  password: requireEnv("NEXTCLOUD_PASSWORD"),
  uploadFolder: requireEnv("NEXTCLOUD_UPLOAD_FOLDER"),
  keepFiles: true,
};
await uploadPdfToNextcloud(pdfPath, nextcloudConfig);
console.log("uploadPdfToNextcloud: OK");

const paperlessConfig: PaperlessConfig = {
  postDocumentUrl: requireEnv("PAPERLESS_POST_DOCUMENT_URL"),
  authToken: requireEnv("PAPERLESS_TOKEN"),
  keepFiles: true,
  groupMultiPageScanIntoAPdf: false,
  alwaysSendAsPdfFile: true,
};
await uploadPdfToPaperless(pdfPath, paperlessConfig);
console.log("uploadPdfToPaperless: OK");

if (process.env["WEBHOOK_URL"]) {
  const webhookConfig: WebhookConfig = {
    url: process.env["WEBHOOK_URL"],
    auth: (process.env["WEBHOOK_AUTH"] as WebhookConfig["auth"]) ??
      "none",
    authHeader: process.env["WEBHOOK_AUTH_HEADER"] ?? "x-webhook-signature",
    outboxDir: path.join(work, "outbox"),
    maxAttempts: 5,
    keepFiles: true,
  };
  if (process.env["WEBHOOK_SECRET"]) {
    webhookConfig.auth = "hmac";
    webhookConfig.secret = process.env["WEBHOOK_SECRET"];
  }
  await sendScanEvent(
    buildScanContent(new Date()),
    [{ path: pdfPath, contentType: "application/pdf" }],
    [],
    webhookConfig,
  );
  console.log("sendScanEvent: OK");
}

await fs.rm(work, { recursive: true, force: true });
console.log("PUMF_OK");