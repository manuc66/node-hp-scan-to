import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import { postProcessing } from "../src/postProcessing.js";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import type { PaperlessConfig } from "../src/paperless/PaperlessConfig.js";
import type { S3Config } from "../src/s3/S3Config.js";
import nock from "nock";
import path from "node:path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Regression tests for the sidecar/post-command issues found in the
 * review of #1693. They encode the behavior the README promises; they
 * fail against the current PR and should pass once the issues are fixed.
 */
describe("postProcessing - post-command / sidecar issues", () => {
  const tempFolder = path.resolve(__dirname, "./tmp/pr1693-issues");
  const s3Url = "http://s3.example.test";
  const paperlessUrl = "http://paperless.example.test";

  function makePage(pagePath: string): ScanPage {
    return {
      pageNumber: 1,
      path: pagePath,
      width: 400,
      height: 300,
      xResolution: 96,
      yResolution: 96,
    };
  }

  function s3Config(overrides?: Partial<S3Config>): S3Config {
    return {
      endpointUrl: s3Url,
      region: "eu-west-1",
      bucket: "scans",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: true,
      keepFiles: false,
      ...overrides,
    };
  }

  function paperlessConfig(
    overrides?: Partial<PaperlessConfig>,
  ): PaperlessConfig {
    return {
      postDocumentUrl: `${paperlessUrl}/api/documents/post_document/`,
      authToken: "test-token",
      keepFiles: false,
      groupMultiPageScanIntoAPdf: false,
      alwaysSendAsPdfFile: false,
      ...overrides,
    };
  }

  /** Appends a marker in place and writes an OCR-like sidecar beside the input. */
  const appendAndSidecar = [
    "node",
    "-e",
    "const fs=require('fs');" +
      "fs.appendFileSync(process.argv[1],'X');" +
      "fs.writeFileSync(process.argv[1]+'.txt','OCR');",
    "{input}",
  ];

  beforeEach(async () => {
    nock.cleanAll();
    nock.disableNetConnect();
    await fs.rm(tempFolder, { recursive: true, force: true });
    await fs.mkdir(tempFolder, { recursive: true });
  });

  afterEach(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await fs.rm(tempFolder, { recursive: true, force: true });
  });

  describe("a file that appears in the output folder while the hook runs", () => {
    // In `listen` / `adf-autoscan`, capture does not wait for the processing
    // queue: the next scan's page can be written into the same folder while
    // this job's hook holds the snapshot window open. Such a file is not a
    // sidecar of this scan and must not be uploaded as one — and with
    // keep_files=false it must definitely not be deleted during cleanup.
    const nextScanPageName = "scan2_page1.jpg";

    async function runScenario(): Promise<{
      running: Promise<Awaited<ReturnType<typeof postProcessing>>>;
      nextPagePath: string;
      nextUpload: nock.Scope;
      pageSidecarUpload: nock.Scope;
      pagePath: string;
    }> {
      const dir = path.join(tempFolder, "concurrent");
      const pagePath = path.join(dir, "scan1_page1.jpg");
      const nextPagePath = path.join(dir, nextScanPageName);
      // Outside the watched folders: the flag only synchronizes the test and
      // must not itself be picked up as a sidecar.
      const hookStartedFlag = path.join(tempFolder, "hook-started.flag");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(pagePath, "content");

      // The hook signals its start (the `before` snapshot is taken by then)
      // and holds the window open for a second so the test can write into
      // the folder in between, exactly like a concurrent capture would.
      const hook = [
        "node",
        "-e",
        "const fs=require('fs');" +
          "fs.writeFileSync(process.argv[2],'started');" +
          "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);" +
          "fs.appendFileSync(process.argv[1],'X');" +
          "fs.writeFileSync(process.argv[1]+'.txt','OCR');",
        "{input}",
        hookStartedFlag,
      ];

      const nextUpload = nock(s3Url)
        .intercept(`/scans/${nextScanPageName}`, "PUT")
        .reply(200);
      const pageSidecarUpload = nock(s3Url)
        .intercept("/scans/scan1_page1.jpg.txt", "PUT")
        .reply(200);
      nock(s3Url).intercept("/scans/scan1_page1.jpg", "PUT").reply(200);

      const scanConfig = {
        directoryConfig: { filePattern: "scan", directory: dir },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        s3Config: s3Config({ keepFiles: false }),
        postCommandImage: hook,
      } as unknown as ScanConfig;

      const scanJobContent: ScanContent = { elements: [makePage(pagePath)] };

      const running = postProcessing(
        scanConfig,
        dir,
        dir,
        1,
        scanJobContent,
        new Date(),
        false,
      );

      const startedAt = Date.now();
      while (!(await flagExists(hookStartedFlag))) {
        if (Date.now() - startedAt > 10_000) {
          throw new Error("the post-command never started");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Simulates the listen loop capturing the next scan during the window.
      await fs.writeFile(nextPagePath, "next");

      return { running, nextPagePath, nextUpload, pageSidecarUpload, pagePath };
    }

    async function flagExists(flagPath: string): Promise<boolean> {
      try {
        await fs.access(flagPath);
        return true;
      } catch {
        return false;
      }
    }

    it("does not upload it as a sidecar of the current scan", async () => {
      const { running, nextUpload, pageSidecarUpload } = await runScenario();

      await running;

      // The hook's own sidecar still travels with the scan: the sidecar
      // path stays exercised, only the foreign file is excluded.
      expect(pageSidecarUpload.isDone()).to.be.true;
      expect(nextUpload.isDone()).to.be.false;
    });

    it("does not delete it during cleanup", async () => {
      const { running, nextPagePath } = await runScenario();

      await running;

      expect(existsSync(nextPagePath)).to.be.true;
      await fs.rm(nextPagePath, { force: true });
    });

    it("does not treat a file written during the PDF merge as a sidecar either", async () => {
      // Same race on the PDF flow: the window spans the whole merge, and the
      // hook runs inside it (createPdfFrom post-processes the PDF before
      // mergeToPdf returns), which is the synchronization point used here.
      const dir = path.join(tempFolder, "concurrent-pdf");
      const pagePath = path.join(dir, "merge1_page1.jpg");
      const nextPagePath = path.join(dir, "foreign_capture.jpg");
      // Outside the watched folders (dir is passed as folder and tempFolder).
      const hookStartedFlag = path.join(tempFolder, "hook-started-pdf.flag");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(pagePath, "content");

      const hook = [
        "node",
        "-e",
        "const fs=require('fs');" +
          "fs.writeFileSync(process.argv[2],'started');" +
          "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);" +
          "fs.appendFileSync(process.argv[1],'X');" +
          "fs.writeFileSync(process.argv[1]+'.txt','OCR');",
        "{input}",
        hookStartedFlag,
      ];

      const foreignUpload = nock(s3Url)
        .intercept("/scans/foreign_capture.jpg", "PUT")
        .reply(200);
      const pdfUpload = nock(s3Url)
        .intercept(/\/scans\/.+\.pdf$/, "PUT")
        .reply(200);
      const pdfSidecarUpload = nock(s3Url)
        .intercept(/\/scans\/.+\.pdf\.txt$/, "PUT")
        .reply(200);

      const scanConfig = {
        directoryConfig: { filePattern: "scan", directory: dir },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        s3Config: s3Config({ keepFiles: false }),
        postCommandPdf: hook,
      } as unknown as ScanConfig;

      const running = postProcessing(
        scanConfig,
        dir,
        dir,
        1,
        { elements: [makePage(pagePath)] },
        new Date(),
        true,
      );

      const startedAt = Date.now();
      while (!(await flagExists(hookStartedFlag))) {
        if (Date.now() - startedAt > 10_000) {
          throw new Error("the post-command never started");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Simulates a file landing in the folder while the merge runs.
      await fs.writeFile(nextPagePath, "foreign");

      await running;

      // Sanity: the PDF and its hook-written sidecar were delivered.
      expect(pdfUpload.isDone()).to.be.true;
      expect(pdfSidecarUpload.isDone()).to.be.true;
      // The foreign file must neither be delivered as a sidecar...
      expect(foreignUpload.isDone()).to.be.false;
      // ...nor deleted during cleanup.
      expect(existsSync(nextPagePath)).to.be.true;
      await fs.rm(nextPagePath, { force: true });
    }).timeout(20_000);
  });

  describe("a sidecar written beside a Paperless-generated PDF", () => {
    // The PDF hook runs during the Paperless stage; the file it writes beside
    // the converted PDF must be collected and delivered like any other sidecar
    // (here, alongside the image hook's own sidecar).
    it("is uploaded to S3 like every other sidecar", async () => {
      const dir = path.join(tempFolder, "paperless-pdf-sidecar");
      const pagePath = path.join(dir, "page.jpg");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(pagePath, "content");

      const pdfSidecarUpload = nock(s3Url)
        .intercept("/scans/page.pdf.txt", "PUT")
        .reply(200);
      nock(s3Url).intercept("/scans/page.jpg", "PUT").reply(200);
      nock(s3Url).intercept("/scans/page.jpg.txt", "PUT").reply(200);
      nock(paperlessUrl).post("/api/documents/post_document/").reply(201, "1");

      const scanConfig = {
        directoryConfig: { filePattern: "scan", directory: dir },
        paperlessConfig: paperlessConfig({
          alwaysSendAsPdfFile: true,
          keepFiles: true,
        }),
        nextcloudConfig: undefined,
        s3Config: s3Config({ keepFiles: true }),
        postCommandImage: appendAndSidecar,
        postCommandPdf: appendAndSidecar,
      } as unknown as ScanConfig;

      const scanJobContent: ScanContent = { elements: [makePage(pagePath)] };

      await postProcessing(
        scanConfig,
        dir,
        dir,
        1,
        scanJobContent,
        new Date(),
        false,
      );

      // Sanity: the hook ran on the converted PDF and wrote beside it.
      expect(existsSync(path.join(dir, "page.pdf.txt"))).to.be.true;
      // The sidecar must travel with the scan to S3, like the one written
      // beside the page image (page.jpg.txt, mocked above).
      expect(pdfSidecarUpload.isDone()).to.be.true;
    });
  });

  describe("page images kept on disk with Paperless-only delivery", () => {
    // The image hook is independent from the PDF hook: even when Paperless is
    // the only target and the pages are converted to PDF, a configured image
    // command runs on each kept page image.
    it("applies the post-command to the kept page images", async () => {
      const dir = path.join(tempFolder, "kept-images");
      const pagePath = path.join(dir, "kept.jpg");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(pagePath, "content");

      nock(paperlessUrl).post("/api/documents/post_document/").reply(201, "1");

      const appendInPlace = [
        "node",
        "-e",
        "require('fs').appendFileSync(process.argv[1],'X')",
        "{input}",
      ];

      const scanConfig = {
        directoryConfig: { filePattern: "scan", directory: dir },
        paperlessConfig: paperlessConfig({
          alwaysSendAsPdfFile: true,
          keepFiles: true,
        }),
        nextcloudConfig: undefined,
        s3Config: undefined,
        postCommandImage: appendInPlace,
      } as unknown as ScanConfig;

      const scanJobContent: ScanContent = { elements: [makePage(pagePath)] };

      await postProcessing(
        scanConfig,
        dir,
        dir,
        1,
        scanJobContent,
        new Date(),
        false,
      );

      expect((await fs.readFile(pagePath, "utf8")).endsWith("X")).to.be.true;
    });
  });

  describe("a file a hook writes under a name the scan does not own", () => {
    // Only files named after the scan's own files are claimed as sidecars.
    // A hook (or any other program) writing "notes.txt" beside the scan must
    // not have that file uploaded as a sidecar, nor removed during cleanup.
    it("is neither delivered nor removed", async () => {
      const dir = path.join(tempFolder, "unnamed-sidecar");
      const pagePath = path.join(dir, "page.jpg");
      const notesPath = path.join(dir, "notes.txt");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(pagePath, "content");

      const unrelatedUpload = nock(s3Url)
        .intercept("/scans/notes.txt", "PUT")
        .reply(200);
      nock(s3Url).intercept("/scans/page.jpg", "PUT").reply(200);

      const hook = [
        "node",
        "-e",
        "const fs=require('fs');" +
          "fs.writeFileSync(process.argv[2],'notes');" +
          "fs.appendFileSync(process.argv[1],'X');",
        "{input}",
        notesPath,
      ];

      const scanConfig = {
        directoryConfig: { filePattern: "scan", directory: dir },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        s3Config: s3Config({ keepFiles: false }),
        postCommandImage: hook,
      } as unknown as ScanConfig;

      await postProcessing(
        scanConfig,
        dir,
        dir,
        1,
        { elements: [makePage(pagePath)] },
        new Date(),
        false,
      );

      expect(unrelatedUpload.isDone()).to.be.false;
      expect(existsSync(notesPath)).to.be.true;
    });
  });

  describe("a hook configured for both image and PDF", () => {
    // Each hook only ever receives the type it was configured for: the image
    // hook gets the page image, the PDF hook the PDF Paperless derives from
    // it. Each logs a tagged line, so a command receiving the wrong type would
    // show up as the wrong tag.
    it("runs the image hook on the image and the PDF hook on the PDF", async () => {
      const dir = path.join(tempFolder, "double-run");
      const pagePath = path.join(dir, "page.jpg");
      const logPath = path.join(tempFolder, "double-run.log");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(pagePath, "content");

      function taggedHook(tag: string): string[] {
        return [
          "node",
          "-e",
          `require('fs').appendFileSync(process.argv[2],'${tag} '+process.argv[1]+'\\n')`,
          "{input}",
          logPath,
        ];
      }

      nock(paperlessUrl).post("/api/documents/post_document/").reply(201, "1");
      nock(s3Url).intercept("/scans/page.jpg", "PUT").reply(200);

      const scanConfig = {
        directoryConfig: { filePattern: "scan", directory: dir },
        paperlessConfig: paperlessConfig({
          alwaysSendAsPdfFile: true,
          keepFiles: true,
        }),
        nextcloudConfig: undefined,
        s3Config: s3Config({ keepFiles: true }),
        postCommandImage: taggedHook("image"),
        postCommandPdf: taggedHook("pdf"),
      } as unknown as ScanConfig;

      await postProcessing(
        scanConfig,
        dir,
        dir,
        1,
        { elements: [makePage(pagePath)] },
        new Date(),
        false,
      );

      const calls = (await fs.readFile(logPath, "utf8")).trim().split("\n");
      expect(calls.sort()).to.deep.equal(
        [
          `image ${path.join(dir, "page.jpg")}`,
          `pdf ${path.join(dir, "page.pdf")}`,
        ].sort(),
      );
    });
  });

  describe("the post-command timeout taken from the config", () => {
    // The runner has its own timeout test; this one makes sure scanConfig
    // actually carries postCommandTimeout all the way to it. Without the
    // wiring the hook below would hang for the 5 minute default.
    it("is passed to the hook runner", async function () {
      this.timeout(20_000);
      const dir = path.join(tempFolder, "timeout");
      const pagePath = path.join(dir, "page.jpg");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(pagePath, "content");

      nock(s3Url).intercept("/scans/page.jpg", "PUT").reply(200);

      const scanConfig = {
        directoryConfig: { filePattern: "scan", directory: dir },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        s3Config: s3Config({ keepFiles: true }),
        postCommandImage: [
          "node",
          "-e",
          "setTimeout(()=>{},600000)",
          "{input}",
        ],
        postCommandTimeout: 500,
      } as unknown as ScanConfig;

      const outcome = await Promise.race([
        postProcessing(
          scanConfig,
          dir,
          dir,
          1,
          { elements: [makePage(pagePath)] },
          new Date(),
          false,
        ).then(() => "settled"),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("still running"), 10_000),
        ),
      ]);

      expect(outcome).to.equal("settled");
    });
  });

  describe("a sidecar written beside a group multi-page Paperless PDF", () => {
    // With groupMultiPageScanIntoAPdf, mergeToPdf names the PDF after the scan
    // count or the file pattern ("scan1.pdf" / "<pattern>.pdf"), never after a
    // page ("page.pdf"). The sidecar is named after the PDF that was actually
    // generated, so it must still be recognised and delivered.
    for (const filePattern of [undefined, "scan"]) {
      it(`is uploaded to S3 with filePattern=${String(filePattern)}`, async () => {
        const dir = path.join(tempFolder, `group-pdf-${String(filePattern)}`);
        const pagePath = path.join(dir, "page.jpg");
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(pagePath, "content");

        const pdfSidecarUpload = nock(s3Url)
          .intercept(/\/scans\/.+\.pdf\.txt$/, "PUT")
          .reply(200);
        nock(s3Url)
          .intercept(/\/scans\/.+$/, "PUT")
          .reply(200);
        nock(paperlessUrl)
          .post("/api/documents/post_document/")
          .reply(201, "1");

        const scanConfig = {
          directoryConfig: { filePattern, directory: dir },
          paperlessConfig: paperlessConfig({
            groupMultiPageScanIntoAPdf: true,
            keepFiles: true,
          }),
          nextcloudConfig: undefined,
          s3Config: s3Config({ keepFiles: true }),
          postCommandPdf: appendAndSidecar,
        } as unknown as ScanConfig;

        await postProcessing(
          scanConfig,
          dir,
          dir,
          1,
          { elements: [makePage(pagePath)] },
          new Date(),
          false,
        );

        expect(pdfSidecarUpload.isDone()).to.be.true;
      });
    }
  });

  describe("a sidecar when the scan itself could not be delivered", () => {
    // Sidecars travel with the scan. A sidecar must not be uploaded to a target
    // that never received the scan: it would become an orphan entry there while
    // the scan itself is missing.
    it("is not sent to a target that did not receive the scan, and is kept", async () => {
      const dir = path.join(tempFolder, "scan-failed-sidecar");
      const pagePath = path.join(dir, "page.jpg");
      const sidecarPath = path.join(dir, "page.jpg.txt");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(pagePath, "content");

      const sidecarUpload = nock(s3Url)
        .intercept("/scans/page.jpg.txt", "PUT")
        .reply(200);
      nock(s3Url).intercept("/scans/page.jpg", "PUT").reply(500);

      const scanConfig = {
        directoryConfig: { filePattern: "scan", directory: dir },
        paperlessConfig: undefined,
        nextcloudConfig: undefined,
        s3Config: s3Config({ keepFiles: false }),
        postCommandImage: appendAndSidecar,
      } as unknown as ScanConfig;

      const result = await postProcessing(
        scanConfig,
        dir,
        dir,
        1,
        { elements: [makePage(pagePath)] },
        new Date(),
        false,
      );

      expect(result.uploadSucceeded).to.be.false;
      expect(sidecarUpload.isDone()).to.be.false;
      expect(existsSync(sidecarPath)).to.be.true;
    });
  });
});
