import { describe, it, afterEach } from "mocha";
import { expect } from "chai";
import http from "node:http";
import type { AddressInfo } from "node:net";
import nock from "nock";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import {
  enqueueScanProcessing,
  flushScanProcessingQueue,
  processScanProcessingJob,
  type ScanProcessingJob,
} from "../src/queue/processingQueue.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import type { ScanContent } from "../src/type/ScanContent.js";
import type { PaperlessConfig } from "../src/paperless/PaperlessConfig.js";
import { fileURLToPath } from "node:url";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JPEG_ASSET = path.resolve(__dirname, "./asset/pdf_processing_sample.jpg");

const openServers: http.Server[] = [];

afterEach(async () => {
  for (const server of openServers.splice(0)) {
    server.close();
  }
});

function makeScanConfig(dir: string, paperless?: PaperlessConfig): ScanConfig {
  return {
    resolution: 300,
    mode: ScanMode.Color,
    width: undefined,
    height: undefined,
    format: ScanFormat.Jpeg,
    directoryConfig: {
      directory: dir,
      tempDirectory: dir,
      filePattern: undefined,
    },
    paperlessConfig: paperless,
    nextcloudConfig: undefined,
    preferEscl: false,
    paperSize: undefined,
    paperDim: undefined,
    paperOrientation: undefined,
  };
}

function makeImageJob(
  dir: string,
  scanCount: number,
  imagePath: string,
  paperless?: PaperlessConfig,
): ScanProcessingJob {
  const scanJobContent: ScanContent = {
    elements: [
      {
        pageNumber: 1,
        path: imagePath,
        width: 100,
        height: 100,
        xResolution: 96,
        yResolution: 96,
      },
    ],
  };
  return {
    scanConfig: makeScanConfig(dir, paperless),
    folder: dir,
    tempFolder: dir,
    scanCount,
    scanJobContent,
    scanDate: new Date(),
    toPdf: false,
  };
}

function makePdfJob(
  dir: string,
  scanCount: number,
  imagePath: string,
): ScanProcessingJob {
  const scanJobContent: ScanContent = {
    elements: [
      {
        pageNumber: 1,
        path: imagePath,
        width: 100,
        height: 100,
        xResolution: 96,
        yResolution: 96,
      },
    ],
  };
  return {
    scanConfig: makeScanConfig(dir),
    folder: dir,
    tempFolder: dir,
    scanCount,
    scanJobContent,
    scanDate: new Date(),
    toPdf: true,
  };
}

function startPaperlessServer(): Promise<{
  bodies: Buffer[];
  port: number;
}> {
  return new Promise((resolve) => {
    const bodies: Buffer[] = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        bodies.push(Buffer.concat(chunks));
        res.statusCode = 200;
        res.end();
      });
    });
    openServers.push(server);
    server.listen(0, () => {
      resolve({ bodies, port: (server.address() as AddressInfo).port });
    });
  });
}

function makePaperlessConfig(url: string): PaperlessConfig {
  return {
    postDocumentUrl: url,
    authToken: "token",
    keepFiles: false,
    groupMultiPageScanIntoAPdf: false,
    alwaysSendAsPdfFile: false,
  };
}

describe("processing queue", () => {
  it("drops a scan into the queue without waiting for the delivery work", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "processing-queue-"));
    nock.cleanAll();
    nock.disableNetConnect();
    try {
      const scope = nock("http://paperless.example.test")
        .post("/api/documents/post_document/")
        .reply(200);
      const paperless = makePaperlessConfig(
        "http://paperless.example.test/api/documents/post_document/",
      );

      const image = path.join(dir, "scan1_page1.jpg");
      await fsPromises.copyFile(JPEG_ASSET, image);

      enqueueScanProcessing(makeImageJob(dir, 1, image, paperless));

      // The capture loop did not wait for the upload: the request has not
      // been sent yet, even though the scan was already dropped in the queue.
      expect(scope.isDone()).to.be.false;

      await flushScanProcessingQueue();
      expect(scope.isDone()).to.be.true;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      nock.cleanAll();
      // Leave net connect enabled: other suites rely on the pre-existing state.
      nock.enableNetConnect();
    }
  });

  it("processes scans in FIFO order through the single-worker drain", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "processing-queue-"));
    const { bodies, port } = await startPaperlessServer();
    try {
      const image1 = path.join(dir, "scan1_page1.jpg");
      const image2 = path.join(dir, "scan2_page1.jpg");
      await fsPromises.copyFile(JPEG_ASSET, image1);
      await fsPromises.copyFile(JPEG_ASSET, image2);
      const paperless = makePaperlessConfig(
        `http://127.0.0.1:${port}/api/documents/post_document/`,
      );

      // Both scans are captured before any delivery started: the queue must
      // hand them to the worker in capture order.
      enqueueScanProcessing(makeImageJob(dir, 1, image1, paperless));
      enqueueScanProcessing(makeImageJob(dir, 2, image2, paperless));
      await flushScanProcessingQueue();

      expect(bodies).to.have.length(2);
      expect(bodies[0].toString("utf8")).to.contain("scan1_page1.jpg");
      expect(bodies[1].toString("utf8")).to.contain("scan2_page1.jpg");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("processScanProcessingJob runs a single job to completion when awaited", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "processing-queue-"));
    try {
      const image = path.join(dir, "scan1_page1.jpg");
      await fsPromises.copyFile(JPEG_ASSET, image);
      const result = await processScanProcessingJob(makePdfJob(dir, 1, image));
      expect(result.uploadSucceeded).to.be.true;
      expect(fs.statSync(path.join(dir, "scan1.pdf")).size).to.be.greaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});