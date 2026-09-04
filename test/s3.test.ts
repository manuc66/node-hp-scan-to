import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import nock from "nock";
import os from "node:os";
import fsPromises from "node:fs/promises";
import { uploadImagesToS3, uploadPdfToS3, s3ObjectLocation } from "../src/s3/s3.js";
import type { S3Config } from "../src/s3/S3Config.js";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import { convertToPdf } from "../src/pdfProcessing.js";

const region = "eu-west-1";
const accessKeyId = "testAccessKeyId";
const secretAccessKey = "testSecretAccessKey";

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function computeExpectedAuthorization(
  method: string,
  pathName: string,
  host: string,
  body: Buffer,
  amzDate: string,
): string {
  const payloadHash = sha256Hex(body);
  const canonicalHeaders = `${[
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join("\n")}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    pathName,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  let signingKey: Buffer = createHmac("sha256", `AWS4${secretAccessKey}`)
    .update(dateStamp)
    .digest();
  signingKey = hmac(signingKey, region);
  signingKey = hmac(signingKey, "s3");
  signingKey = hmac(signingKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign).toString("hex");
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function startVerifyingServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const amzDate = req.headers["x-amz-date"] as string;
        const expected = computeExpectedAuthorization(
          req.method ?? "PUT",
          req.url ?? "/",
          req.headers.host!,
          body,
          amzDate,
        );
        const ok =
          req.method === "PUT" &&
          req.headers.authorization === expected;
        res.statusCode = ok ? 200 : 403;
        res.end(ok ? "" : "SignatureDoesNotMatch");
      });
    });
    server.listen(0, () => resolve(server));
  });
}

function buildS3Config(endpointUrl: string, forcePathStyle: boolean): S3Config {
  return {
    endpointUrl,
    region,
    bucket: "scans",
    accessKeyId,
    secretAccessKey,
    prefix: "2026/08",
    forcePathStyle,
    keepFiles: false,
  };
}

describe("s3", () => {
  describe("s3ObjectLocation", () => {
    it("builds the bucket and key with the configured prefix", () => {
      const s3Config = buildS3Config("http://127.0.0.1:1", true);
      expect(s3ObjectLocation(s3Config, "scan.pdf")).to.deep.equal({
        bucket: "scans",
        key: "2026/08/scan.pdf",
      });
    });

    it("normalizes Windows-style backslashes in the prefix", () => {
      const s3Config = buildS3Config("http://127.0.0.1:1", true);
      s3Config.prefix = "2026\\08";
      expect(s3ObjectLocation(s3Config, "scan.pdf")).to.deep.equal({
        bucket: "scans",
        key: "2026/08/scan.pdf",
      });
    });
  });

  const fileName = "s3_sample.jpg";
  const scanDate = new Date(2026, 7, 28, 20, 13, 45);

  let tempDir: string;
  let filePath: string;
  let scanJobContent: ScanContent;
  let scanPage: ScanPage;

  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  before(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "s3-test-"));
    filePath = path.join(tempDir, fileName);
    await fsPromises.writeFile(filePath, "fake-jpg-content");
  });

  after(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    scanJobContent = { elements: [] };
    scanPage = {
      pageNumber: 1,
      path: filePath,
      width: 400,
      height: 300,
      xResolution: 96,
      yResolution: 96,
    };
  });

  describe("path-style upload against a verifying server", () => {
    it("uploads a single image with a valid SigV4 signature", async () => {
      const server = await startVerifyingServer();
      try {
        const port = (server.address() as AddressInfo).port;
        const s3Config = buildS3Config(`http://127.0.0.1:${port}`, true);
        scanJobContent.elements.push(scanPage);

        await uploadImagesToS3(scanJobContent, s3Config);
      } finally {
        server.close();
      }
    });

    it("uploads multiple images", async () => {
      const server = await startVerifyingServer();
      try {
        const port = (server.address() as AddressInfo).port;
        const s3Config = buildS3Config(`http://127.0.0.1:${port}`, true);

        scanJobContent.elements.push(scanPage);
        scanJobContent.elements.push(scanPage);
        scanJobContent.elements.push(scanPage);

        await uploadImagesToS3(scanJobContent, s3Config);
      } finally {
        server.close();
      }
    });

    it("throws when the signature is rejected", async () => {
      const s3Config = buildS3Config(
        "http://127.0.0.1:1",
        true,
      );
      s3Config.secretAccessKey = "wrong-secret";
      scanJobContent.elements.push(scanPage);

      let threw = false;
      try {
        await uploadImagesToS3(scanJobContent, s3Config);
      } catch {
        threw = true;
      }
      if (!threw) {
        throw new Error("Should have thrown");
      }
    });
  });

  describe("virtual-host style upload (nock)", () => {
    it("uploads an image to <bucket>.<endpoint>", async () => {
      nock("https://scans.s3.example.test")
        .matchHeader("authorization", /^AWS4-HMAC-SHA256 Credential=testAccessKeyId\//)
        .matchHeader("x-amz-content-sha256", /^[0-9a-f]{64}$/)
        .matchHeader("content-type", "image/jpeg")
        .put("/2026/08/s3_sample.jpg", Buffer.from("fake-jpg-content"))
        .reply(200);

      const s3Config = buildS3Config(
        "https://s3.example.test",
        false,
      );
      scanJobContent.elements.push(scanPage);

      await uploadImagesToS3(scanJobContent, s3Config);
    });
  });

  describe("endpoint with a path prefix (nock)", () => {
    it("keeps the prefix and the separator in path-style URLs", async () => {
      nock("https://gw.example.test")
        .put("/s3/scans/2026/08/s3_sample.jpg", Buffer.from("fake-jpg-content"))
        .reply(200);

      const s3Config = buildS3Config("https://gw.example.test/s3/", true);
      scanJobContent.elements.push(scanPage);

      await uploadImagesToS3(scanJobContent, s3Config);
    });

    it("keeps the prefix and the separator in virtual-host style URLs", async () => {
      nock("https://scans.s3.example.test")
        .put("/gateway/2026/08/s3_sample.jpg", Buffer.from("fake-jpg-content"))
        .reply(200);

      const s3Config = buildS3Config("https://s3.example.test/gateway", false);
      scanJobContent.elements.push(scanPage);

      await uploadImagesToS3(scanJobContent, s3Config);
    });
  });

  describe("uploadPdfToS3", () => {
    it("success upload pdf document", async () => {
      const server = await startVerifyingServer();
      try {
        const port = (server.address() as AddressInfo).port;
        const s3Config = buildS3Config(`http://127.0.0.1:${port}`, true);

        const pdfFilePath = await convertToPdf(scanPage, false, scanDate);
        await uploadPdfToS3(pdfFilePath, s3Config);
      } finally {
        server.close();
      }
    });

    it("pdf document not set", async () => {
      const s3Config = buildS3Config("http://127.0.0.1:1", true);
      await uploadPdfToS3(null, s3Config);
    });
  });
});