import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import { postProcessing } from "../src/postProcessing.js";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import nock from "nock";
import path from "node:path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("postProcessing", () => {
  const fileName = "post_processing_sample.jpg";
  const tempFolder = path.resolve(__dirname, "./tmp");
  const assetDir = path.resolve(__dirname, "./asset");
  const filePath = path.join(assetDir, fileName);

  const appendTemplate =
    'node -e "require(\'fs\').appendFileSync(process.argv[1],\'X\')" "{input}"';

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

  it("should apply the post-command to delivered images", async () => {
    scanConfig = {
      ...scanConfig,
      postCommand: appendTemplate,
    };
    await postProcessing(
      scanConfig,
      tempFolder,
      tempFolder,
      1,
      scanJobContent,
      new Date(),
      false,
    );
    expect((await fs.readFile(filePath, "utf8")).endsWith("X")).to.be.true;
  });

  it("should apply the post-command to the generated PDF", async () => {
    const pdfFolder = path.join(tempFolder, "pdf-hook-test");
    await fs.mkdir(pdfFolder, { recursive: true });
    scanConfig = {
      ...scanConfig,
      postCommand: appendTemplate,
    };
    await postProcessing(
      scanConfig,
      pdfFolder,
      tempFolder,
      1,
      scanJobContent,
      new Date(),
      true,
    );
    const pdfFiles = (await fs.readdir(pdfFolder)).filter((f) =>
      f.endsWith(".pdf"),
    );
    expect(pdfFiles).to.have.lengthOf(1);
    expect(
      (await fs.readFile(path.join(pdfFolder, pdfFiles[0]), "utf8")).endsWith(
        "X",
      ),
    ).to.be.true;
    await fs.rm(pdfFolder, { recursive: true, force: true });
  });
});
