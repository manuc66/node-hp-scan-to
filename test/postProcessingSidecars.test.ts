import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { postProcessing } from "../src/postProcessing.js";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import type { PaperlessConfig } from "../src/paperless/PaperlessConfig.js";
import type { NextcloudConfig } from "../src/nextcloud/NextcloudConfig.js";
import type { S3Config } from "../src/s3/S3Config.js";
import nock from "nock";
import path from "node:path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * A post-processing hook may write files beside the scan (an OCR text, a
 * signature). S3 and Nextcloud receive them next to the scan, Paperless does
 * not, and a sidecar is only ever removed from disk once it was delivered.
 */
describe("postProcessing - sidecar delivery", () => {
  const tempFolder = path.resolve(__dirname, "./tmp/sidecar-delivery");
  const pagePath = path.join(tempFolder, "sidecar_scan.jpg");
  // The hook derives the sidecar name from its input, so it keeps the page
  // extension: `page.jpg` yields `page.jpg.txt`.
  const sidecarPath = path.join(tempFolder, "sidecar_scan.jpg.txt");
  const nextcloudUrl = "https://nextcloud.example.test";

  // Writes an OCR-like file next to the input, then appends to the input so
  // the hook proves it ran.
  const writeSidecar = [
    "node",
    "-e",
    "const fs=require('fs');fs.appendFileSync(process.argv[1],'X');fs.writeFileSync(process.argv[1]+'.txt','OCR');",
    "{input}",
  ];

  let scanJobContent: ScanContent;
  let scanPage: ScanPage;
  let scanConfig: ScanConfig;

  beforeEach(async () => {
    nock.cleanAll();
    nock.disableNetConnect();

    await fs.mkdir(tempFolder, { recursive: true });
    await fs.writeFile(pagePath, "fake-jpg-content");
    await fs.rm(sidecarPath, { force: true });

    scanPage = {
      pageNumber: 1,
      path: pagePath,
      width: 400,
      height: 300,
      xResolution: 96,
      yResolution: 96,
    };
    scanJobContent = { elements: [scanPage] };

    scanConfig = {
      directoryConfig: { filePattern: "scan", directory: tempFolder },
      paperlessConfig: undefined,
      nextcloudConfig: undefined,
      s3Config: undefined,
      postCommand: writeSidecar,
    } as unknown as ScanConfig;
  });

  afterEach(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await fs.rm(tempFolder, { recursive: true, force: true });
  });

  function s3Config(overrides?: Partial<S3Config>): S3Config {
    return {
      endpointUrl: "http://s3.example.test",
      region: "eu-west-1",
      bucket: "scans",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: true,
      keepFiles: false,
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

  function paperlessConfig(
    overrides?: Partial<PaperlessConfig>,
  ): PaperlessConfig {
    return {
      postDocumentUrl:
        "http://paperless.example.test/api/documents/post_document/",
      authToken: "test-token",
      keepFiles: false,
      groupMultiPageScanIntoAPdf: false,
      alwaysSendAsPdfFile: false,
      ...overrides,
    };
  }

  function mockNextcloudUploads(): void {
    // The folder check runs once per delivery (scan, then sidecars).
    nock(nextcloudUrl)
      .intercept("/remote.php/dav/files/scanner/scan", "PROPFIND")
      .reply(
        207,
        '<?xml version="1.0"?>\n<d:multistatus xmlns:d="DAV:"></d:multistatus>',
      )
      .persist();
    nock(nextcloudUrl)
      .intercept(/\/remote\.php\/dav\/files\/scanner\/scan\/.+$/, "PUT")
      .reply(201)
      .persist();
  }

  function mockS3Uploads(): void {
    nock("http://s3.example.test")
      .intercept(/\/scans\/.+$/, "PUT")
      .reply(200)
      .persist();
  }

  async function runImageFlow(): ReturnType<typeof postProcessing> {
    return postProcessing(
      scanConfig,
      tempFolder,
      tempFolder,
      1,
      scanJobContent,
      new Date(),
      false,
    );
  }

  it("detects the file the hook wrote beside the scan", async () => {
    scanConfig.s3Config = s3Config({ keepFiles: true });
    mockS3Uploads();

    await runImageFlow();

    expect(existsSync(sidecarPath)).to.be.true;
    expect(await fs.readFile(sidecarPath, "utf8")).to.equal("OCR");
  });

  it("uploads the sidecar to S3 next to the scan", async () => {
    scanConfig.s3Config = s3Config({ keepFiles: true });
    const uploaded = nock("http://s3.example.test")
      .intercept(/\/scans\/sidecar_scan\.jpg\.txt$/, "PUT")
      .reply(200);
    mockS3Uploads();

    await runImageFlow();

    expect(uploaded.isDone()).to.be.true;
  });

  it("uploads the sidecar to Nextcloud next to the scan", async () => {
    scanConfig.nextcloudConfig = nextcloudConfig({ keepFiles: true });
    const uploaded = nock(nextcloudUrl)
      .intercept(
        /\/remote\.php\/dav\/files\/scanner\/scan\/sidecar_scan\.jpg\.txt$/,
        "PUT",
      )
      .reply(201);
    mockNextcloudUploads();

    await runImageFlow();

    expect(uploaded.isDone()).to.be.true;
  });

  it("sends the sidecar to both configured targets", async () => {
    scanConfig.s3Config = s3Config({ keepFiles: true });
    scanConfig.nextcloudConfig = nextcloudConfig({ keepFiles: true });
    const toS3 = nock("http://s3.example.test")
      .intercept(/\/scans\/sidecar_scan\.jpg\.txt$/, "PUT")
      .reply(200);
    const toNextcloud = nock(nextcloudUrl)
      .intercept(
        /\/remote\.php\/dav\/files\/scanner\/scan\/sidecar_scan\.jpg\.txt$/,
        "PUT",
      )
      .reply(201);
    mockS3Uploads();
    mockNextcloudUploads();

    const result = await runImageFlow();

    expect(result.uploadSucceeded).to.be.true;
    expect(toS3.isDone()).to.be.true;
    expect(toNextcloud.isDone()).to.be.true;
  });

  it("does not send the sidecar to Paperless", async () => {
    scanConfig.paperlessConfig = paperlessConfig({ keepFiles: true });
    const toPaperless = nock("http://paperless.example.test")
      .post("/api/documents/post_document/")
      .reply(201, "1");

    const result = await runImageFlow();

    expect(result.uploadSucceeded).to.be.true;
    // Only the page reaches paperless, never the sidecar.
    expect(toPaperless.pendingMocks()).to.be.empty;
    expect(existsSync(sidecarPath)).to.be.true;
  });

  it("removes a delivered sidecar when keepFiles is false", async () => {
    scanConfig.s3Config = s3Config({ keepFiles: false });
    mockS3Uploads();

    const result = await runImageFlow();

    expect(result.uploadSucceeded).to.be.true;
    expect(existsSync(sidecarPath)).to.be.false;
    expect(existsSync(pagePath)).to.be.false;
  });

  it("keeps the sidecar when no target accepts it", async () => {
    scanConfig.paperlessConfig = paperlessConfig({ keepFiles: false });
    nock("http://paperless.example.test")
      .post("/api/documents/post_document/")
      .reply(201, "1");

    const result = await runImageFlow();

    expect(result.uploadSucceeded).to.be.true;
    // The scan page went to paperless and was cleaned up, the sidecar has
    // nowhere to go so it must not be thrown away.
    expect(existsSync(sidecarPath)).to.be.true;
    expect(existsSync(pagePath)).to.be.false;
  });

  it("keeps the sidecar when the upload fails", async () => {
    scanConfig.s3Config = s3Config({ keepFiles: false });
    nock("http://s3.example.test")
      .intercept(/\/scans\/.+$/, "PUT")
      .reply(500);

    const result = await runImageFlow();

    expect(result.uploadSucceeded).to.be.false;
    expect(result.failures).to.have.lengthOf.at.least(1);
    expect(existsSync(sidecarPath)).to.be.true;
  });

  it("reports a failure when only the sidecar upload fails", async () => {
    scanConfig.s3Config = s3Config({ keepFiles: false });
    // The scan page succeeds, the sidecar is rejected.
    nock("http://s3.example.test")
      .intercept(/\/scans\/sidecar_scan\.jpg$/, "PUT")
      .reply(200);
    nock("http://s3.example.test")
      .intercept(/\/scans\/sidecar_scan\.jpg\.txt$/, "PUT")
      .reply(500);

    const result = await runImageFlow();

    expect(result.uploadSucceeded).to.be.false;
    expect(result.failures).to.have.lengthOf.at.least(1);
    expect(existsSync(sidecarPath)).to.be.true;
  });

  it("leaves the scan untouched when the hook writes nothing beside it", async () => {
    scanConfig.s3Config = s3Config({ keepFiles: false });
    scanConfig.postCommand = [
      "node",
      "-e",
      "require('fs').appendFileSync(process.argv[1],'X')",
      "{input}",
    ];
    const uploads = nock("http://s3.example.test")
      .intercept(/\/.+$/, "PUT")
      .reply(200);

    const result = await runImageFlow();

    expect(result.uploadSucceeded).to.be.true;
    // Exactly one upload: the page itself, no sidecar request.
    expect(uploads.pendingMocks()).to.be.empty;
    expect(existsSync(sidecarPath)).to.be.false;
  });

  it("detects sidecars written while a PDF is generated", async () => {
    // PDF flow: the hook runs on the generated PDF, which may leave files
    // beside it in the output folder.
    scanConfig.s3Config = s3Config({ keepFiles: true });
    scanConfig.postCommand = [
      "node",
      "-e",
      "const fs=require('fs');const out=process.argv[1];fs.writeFileSync(out+'.txt','OCR of '+out);",
      "{input}",
    ];
    mockS3Uploads();

    await postProcessing(
      scanConfig,
      tempFolder,
      tempFolder,
      1,
      scanJobContent,
      new Date(),
      true,
    );

    const sidecars = (await fs.readdir(tempFolder)).filter((f) =>
      f.endsWith(".pdf.txt"),
    );
    expect(sidecars).to.have.lengthOf.at.least(1);
  });
});
