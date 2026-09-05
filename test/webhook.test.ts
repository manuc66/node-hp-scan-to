import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import http from "node:http";
import type { AddressInfo } from "node:net";
import nock from "nock";
import os from "node:os";
import path from "node:path";
import fsPromises from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { flushOutbox, sendScanEvent } from "../src/webhook/webhook.js";
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
    startedAt: "2026-08-31T22:32:10.154Z",
    instance: {
      id: "instance-1",
      startedAt: "2026-08-31T22:00:00.000Z",
      uptimeMs: 1234,
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
      outboxDir: tempDir,
      maxAttempts: 5,
      durableOutbox: true,
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
    it("delivers the event and removes the outbox entry", async () => {
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

    it("keeps the event in the outbox when the endpoint redirects (3xx)", async () => {
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

      expect(finalHit).to.equal(false);
      const remaining = await fsPromises.readdir(tempDir);
      expect(remaining.filter((f) => f.endsWith(".json"))).to.have.length(1);
    });

    it("writes outbox entries with restrictive permissions (0600)", async () => {
      const srv = await startServer([500]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      const entries = (await fsPromises.readdir(tempDir)).filter((f) =>
        f.endsWith(".json"),
      );
      expect(entries).to.have.length(1);
      const stat = await fsPromises.stat(path.join(tempDir, entries[0]));
      expect(stat.mode & 0o777).to.equal(0o600);
    });

    it("best-effort mode sends once and persists nothing on failure", async () => {
      const srv = await startServer([500]);
      const simpleConfig: WebhookConfig = {
        ...config,
        url: `http://127.0.0.1:${srv.port}`,
        durableOutbox: false,
      };

      await sendScanEvent(scanContent, [{ path: filePath }], [], simpleConfig);

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

  describe("retry and idempotency", () => {
    it("keeps the entry after a 5xx and delivers on a later flush with the same id", async () => {
      const srv = await startServer([500, 200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      let files = await fsPromises.readdir(tempDir);
      const pending = files.find((f) => f.endsWith(".json"));
      expect(pending).to.not.be.undefined;
      expect(files.some((f) => f.endsWith(".failed.json"))).to.be.false;

      // Re-schedule the retry as a later boot would, then flush again.
      const entryPath = path.join(tempDir, pending!);
      const entry = JSON.parse(await fsPromises.readFile(entryPath, "utf8")) as {
        id: string;
        attempts: number;
        nextAttemptAt: string;
      };
      expect(entry.attempts).to.equal(1);
      entry.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
      await fsPromises.writeFile(entryPath, JSON.stringify(entry), "utf8");

      await flushOutbox(config);

      expect(srv.requests).to.have.length(2);
      expect(srv.requests[0].headers["idempotency-key"]).to.equal(
        srv.requests[1].headers["idempotency-key"],
      );
      files = await fsPromises.readdir(tempDir);
      expect(files.filter((f) => f.endsWith(".json"))).to.deep.equal([]);
    });

    it("dead-letters on a 4xx response", async () => {
      const srv = await startServer([400]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      const files = await fsPromises.readdir(tempDir);
      expect(files.some((f) => f.endsWith(".failed.json"))).to.be.true;
      expect(files.some((f) => f.endsWith(".json") && !f.endsWith(".failed.json"))).to.be
        .false;
    });

    it("retries on 429 instead of dead-lettering", async () => {
      const srv = await startServer([429, 200]);
      config.url = `http://127.0.0.1:${srv.port}`;

      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      let files = await fsPromises.readdir(tempDir);
      expect(files.some((f) => f.endsWith(".json") && !f.endsWith(".failed.json")))
        .to.be.true;
      expect(files.some((f) => f.endsWith(".failed.json"))).to.be.false;

      const entryFile = files.find(
        (f) => f.endsWith(".json") && !f.endsWith(".failed.json"),
      )!;
      const entry = JSON.parse(
        await fsPromises.readFile(path.join(tempDir, entryFile), "utf8"),
      ) as { nextAttemptAt: string };
      entry.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
      await fsPromises.writeFile(
        path.join(tempDir, entryFile),
        JSON.stringify(entry),
        "utf8",
      );

      await flushOutbox(config);

      expect(srv.requests).to.have.length(2);
      files = await fsPromises.readdir(tempDir);
      expect(files.filter((f) => f.endsWith(".json"))).to.deep.equal([]);
    });

    it("dead-letters after max attempts", async () => {
      config.maxAttempts = 2;
      const srv = await startServer([500, 500]);
      const cfg = { ...config, url: `http://127.0.0.1:${srv.port}` };

      await sendScanEvent(scanContent, [{ path: filePath }], [], cfg);

      let pending = await fsPromises.readdir(tempDir);
      const entryFile = pending.find(
        (f) => f.endsWith(".json") && !f.endsWith(".failed.json"),
      );
      expect(entryFile).to.not.be.undefined;

      const entryPath = path.join(tempDir, entryFile!);
      const entry = JSON.parse(await fsPromises.readFile(entryPath, "utf8")) as {
        nextAttemptAt: string;
      };
      entry.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
      await fsPromises.writeFile(entryPath, JSON.stringify(entry), "utf8");

      await flushOutbox(cfg);

      pending = await fsPromises.readdir(tempDir);
      expect(pending.some((f) => f.endsWith(".failed.json"))).to.be.true;
      expect(
        pending.some((f) => f.endsWith(".json") && !f.endsWith(".failed.json")),
      ).to.be.false;
    });
  });

  describe("restart survival", () => {
    it("keeps a pending entry across processes and flushes it on the next boot", async () => {
      // First process: the webhook is unreachable, the event stays pending with a
      // future retry.
      config.url = "http://127.0.0.1:1";
      await sendScanEvent(scanContent, [{ path: filePath }], [], config);

      const files = await fsPromises.readdir(tempDir);
      expect(
        files.some((f) => f.endsWith(".json") && !f.endsWith(".failed.json")),
      ).to.be.true;

      // Time passes: the retry becomes due before the "next boot".
      const pendingFile = files.find(
        (f) => f.endsWith(".json") && !f.endsWith(".failed.json"),
      )!;
      const entry = JSON.parse(
        await fsPromises.readFile(path.join(tempDir, pendingFile), "utf8"),
      ) as { nextAttemptAt: string };
      entry.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
      await fsPromises.writeFile(
        path.join(tempDir, pendingFile),
        JSON.stringify(entry),
        "utf8",
      );

      // "Restart": a new process boots, webhook is now reachable, flushes.
      const srv = await startServer([200]);
      const restarted = { ...config, url: `http://127.0.0.1:${srv.port}` };
      await flushOutbox(restarted);

      expect(srv.requests).to.have.length(1);
      const after = await fsPromises.readdir(tempDir);
      expect(after.filter((f) => f.endsWith(".json"))).to.deep.equal([]);
    });
  });
});
