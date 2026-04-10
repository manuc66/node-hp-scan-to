import { describe, it, beforeEach } from "mocha";
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



});
