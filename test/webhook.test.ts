import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import http from "node:http";
import type { AddressInfo } from "node:net";
import nock from "nock";
import os from "node:os";
import path from "node:path";
import fsPromises from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { sendScanEvent } from "../src/webhook/webhook.js";
import type { WebhookConfig } from "../src/webhook/WebhookConfig.js";
import type { ScanContent } from "../src/type/ScanContent.js";
import type { ScanMetadata } from "../src/type/ScanMetadata.js";
import { InputSource } from "../src/type/InputSource.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";
import { ScanMode } from "../src/type/scanMode.js";

interface RecordedRequest {
  url: string;
  body: Buffer;
  headers: http.IncomingHttpHeaders;
}

const openServers: http.Server[] = [];

function startServer(statuses: number[]): Promise<{
  requests: RecordedRequest[];
  server: http.Server;
  port: number;
}> {
  return new Promise((resolve) => {
    const requests: RecordedRequest[] = [];
    const server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      requests.push({
        url: req.url ?? "/",
        body: Buffer.concat(chunks),
        headers: req.headers,
      });
      res.statusCode = statuses.shift() ?? 200;
      res.end();
    });
    openServers.push(server);
    server.listen(0, () =>
      resolve({
        requests,
        server,
        port: (server.address() as AddressInfo).port,
      }),
    );
  });
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function buildMetadata(): ScanMetadata {
  return {
    command: "single-scan",
    scanCount: 1,
    device: { ip: "127.0.0.1", isEscl: true },
    target: undefined,
    settings: {
      inputSource: InputSource.Adf,
      contentType: "Document",
      format: "pdf",
      mode: ScanMode.Gray,
      resolution: 200,
      isDuplex: false,
      pageCountingStrategy: PageCountingStrategy.Normal,
      paperSize: undefined,
    },
    startedAt: "2026-08-31T22:32:10.154Z",
    instance: {
      id: "instance-1",
      startedAt: "2026-08-31T22:00:00.000Z",
    },
  };
}

describe("webhook", () => {
  let tempDir: string;
  let filePath: string;
  let config: WebhookConfig;
  let scanContent: ScanContent;

  beforeEach(async () => {
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.enableNetConnect();

    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "webhook-test-"));
    filePath = path.join(tempDir, "scan.pdf");
    await fsPromises.writeFile(filePath, "fake-pdf-content");
    config = {
      url: "http://127.0.0.1:1",
      auth: "none",
      authHeader: "x-webhook-signature",
      keepFiles: false,
    };
    scanContent = { elements: [], meta: buildMetadata() };
  });

  afterEach(async () => {
    for (const server of openServers.splice(0)) {
      server.close();
    }
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  describe("sendScanEvent", () => {
    it("delivers the event and does not persist anything", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      expect(srv.requests).to.have.length(1);
      const req = srv.requests[0];
      const payload = JSON.parse(req.body.toString("utf8")) as {
        id: string;
        type: string;
        files: { name: string; size: number; sha256: string }[];
      };
      expect(payload.id).to.equal(req.headers["idempotency-key"]);
      expect(payload.type).to.equal("scan-completed");
      expect(payload.files[0].name).to.equal("scan.pdf");
      expect(payload.files[0].size).to.equal("fake-pdf-content".length);
      expect(payload.files[0].sha256).to.equal(
        sha256Hex(Buffer.from("fake-pdf-content")),
      );

      const remaining = await fsPromises.readdir(tempDir);
      expect(remaining.filter((f) => f.endsWith(".json"))).to.deep.equal([]);
    });

    it("infers the content type from the file extension when not provided", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      const payload = JSON.parse(srv.requests[0].body.toString("utf8")) as {
        files: { contentType?: string }[];
      };
      expect(payload.files[0].contentType).to.equal("application/pdf");
    });

    it("enriches the metadata with endedAt and durationMs", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      const payload = JSON.parse(srv.requests[0].body.toString("utf8")) as {
        metadata: { endedAt?: string; durationMs?: number };
      };
      expect(payload.metadata.endedAt).to.be.a("string");
      expect(payload.metadata.durationMs).to.be.greaterThanOrEqual(0);
    });

    it("populates pages with per-page dimensions, resolution and size", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;
      const pagePath = path.join(tempDir, "page1.jpg");
      await fsPromises.writeFile(pagePath, "fake-page-content");
      scanContent.elements.push({
        pageNumber: 1,
        path: pagePath,
        width: 400,
        height: 300,
        xResolution: 96,
        yResolution: 96,
      });

      await sendScanEvent(scanContent, [{ path: pagePath }], [], config);

      const payload = JSON.parse(srv.requests[0].body.toString("utf8")) as {
        pages: Record<string, unknown>[];
      };
      expect(payload.pages).to.have.length(1);
      expect(payload.pages[0]).to.deep.include({
        pageNumber: 1,
        format: "jpg",
        width: 400,
        height: 300,
        xResolution: 96,
        yResolution: 96,
      });
      expect(payload.pages[0]).to.not.have.property("path");
    });

    it("does not follow a redirect from the endpoint (3xx)", async () => {
      let finalHit = false;
      const server = http.createServer((req, res) => {
        if (req.url === "/start") {
          res.writeHead(301, { location: "/final" });
          res.end();
          return;
        }
        finalHit = true;
        res.writeHead(200);
        res.end();
      });
      openServers.push(server);
      await new Promise<void>((resolve) => server.listen(0, () => resolve()));
      const port = (server.address() as AddressInfo).port;
      config.url = `http://127.0.0.1:${port}/start`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      // The 301 must not be followed as an empty GET that would acknowledge
      // the event without its payload.
      expect(finalHit).to.equal(false);
    });

    it("sends once and persists nothing on failure", async () => {
      const srv = await startServer([500]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      expect(srv.requests).to.have.length(1);
      const remaining = await fsPromises.readdir(tempDir);
      expect(remaining.filter((f) => f.endsWith(".json"))).to.deep.equal([]);
    });

    it("signs the payload with the secret when configured", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;
      config.secret = "s3cr3t";
      config.auth = "hmac";

      await sendScanEvent(
        scanContent,
        [{ path: filePath }],
        [],
        config,
      );

      const req = srv.requests[0];
      const expected = createHmac("sha256", "s3cr3t")
        .update(req.body)
        .digest("hex");
      expect(req.headers["x-webhook-signature"]).to.equal(expected);
    });

    it("uses the configured HMAC header name", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;
      config.secret = "s3cr3t";
      config.auth = "hmac";
      config.authHeader = "x-n8n-signature";

      await sendScanEvent(
        scanContent,
        [{ path: filePath }],
        [],
        config,
      );

      const req = srv.requests[0];
      expect(req.headers["x-n8n-signature"]).to.be.a("string");
      expect(req.headers["x-webhook-signature"]).to.be.undefined;
    });

    it("sends a bearer token when auth is bearer", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;
      config.auth = "bearer";
      config.token = "tok123";

      await sendScanEvent(
        scanContent,
        [{ path: filePath }],
        [],
        config,
      );

      const req = srv.requests[0];
      expect(req.headers.authorization).to.equal("Bearer tok123");
    });

    it("sends basic auth when auth is basic", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;
      config.auth = "basic";
      config.username = "scanner";
      config.password = "pw";

      await sendScanEvent(
        scanContent,
        [{ path: filePath }],
        [],
        config,
      );

      const req = srv.requests[0];
      const expected = Buffer.from("scanner:pw").toString("base64");
      expect(req.headers.authorization).to.equal(`Basic ${expected}`);
    });

    it("refuses to deliver an event whose auth scheme is missing its credentials", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      const invalidConfigs: WebhookConfig[] = [
        { ...config, auth: "hmac" }, // no secret
        { ...config, auth: "bearer" }, // no token
        { ...config, auth: "basic", username: "scanner" }, // no password
      ];

      for (const invalidConfig of invalidConfigs) {
        let threw: unknown;
        try {
          await sendScanEvent(scanContent, [{ path: filePath }], [], invalidConfig);
        } catch (e) {
          threw = e;
        }
        expect(
          threw,
          `auth "${invalidConfig.auth}" without its credentials should be rejected`,
        ).to.exist;
      }

      expect(srv.requests).to.have.length(0);
    });

    it("does not sign the payload when auth is none", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;
      config.auth = "none";
      config.secret = "s3cr3t";

      await sendScanEvent(
        scanContent,
        [{ path: filePath }],
        [],
        config,
      );

      const req = srv.requests[0];
      expect(req.headers["x-webhook-signature"]).to.be.undefined;
      expect(req.headers.authorization).to.be.undefined;
    });

    it("does not send anything when there is no metadata", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent({ elements: [] }, [{ path: filePath }], [], config);

      expect(srv.requests).to.have.length(0);
    });

    it("embeds the store location of the file when provided", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(
        scanContent,
        [
          {
            path: filePath,
            store: "s3",
            location: { bucket: "scans", key: "2026/08/scan.pdf" },
          },
        ],
        [],
        config,
      );

      const payload = JSON.parse(srv.requests[0].body.toString("utf8")) as {
        files: { store: string; location: { bucket: string; key: string } }[];
      };
      expect(payload.files[0].store).to.equal("s3");
      expect(payload.files[0].location).to.deep.equal({
        bucket: "scans",
        key: "2026/08/scan.pdf",
      });
      expect(payload.files[0]).to.not.have.property("path");
    });

    it("keeps the local path only for files stored locally", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      const payload = JSON.parse(srv.requests[0].body.toString("utf8")) as {
        files: { path?: string }[];
      };
      expect(payload.files[0].path).to.equal(filePath);
    });

    it("publishes a scan-delivery-failed event when a delivery target failed", async () => {
      const srv = await startServer([200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(
        scanContent,
        [{ path: filePath }],
        [{ target: "s3", status: "failed", error: "upload boom" }],
        config,
      );

      const payload = JSON.parse(srv.requests[0].body.toString("utf8")) as {
        type: string;
        delivery: { target: string; status: string; error: string }[];
      };
      expect(payload.type).to.equal("scan-delivery-failed");
      expect(payload.delivery).to.deep.equal([
        { target: "s3", status: "failed", error: "upload boom" },
      ]);
    });
  });

});
