import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import DeviceClient from "../src/DeviceClient.js";
import {
  executeScanJob,
  handleScanProcessingState,
} from "../src/scanJobHandlers.js";
import { JobState, PageState } from "../src/hpModels/Job.js";
import type Job from "../src/hpModels/Job.js";
import { InputSource } from "../src/type/InputSource.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";
import type { IScanJobSettings } from "../src/hpModels/IScanJobSettings.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import type { ScanContent } from "../src/type/ScanContent.js";
import { createImageFormat } from "../src/imageFormats/index.js";
import { ScanFormat } from "../src/type/scanFormat.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readAsset(name: string): Promise<string> {
  return fsPromises.readFile(path.resolve(__dirname, "./asset", name), "utf-8");
}

function jpegSettings(): IScanJobSettings {
  return {
    format: createImageFormat(ScanFormat.Jpeg),
    mode: "Color",
    xResolution: 200,
    yResolution: 200,
  } as unknown as IScanJobSettings;
}

describe("scanJobHandlers flows", () => {
  let tempDir: string;

  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanJobHandlers-test-"));
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("eSCL job handling", () => {
    function esclCapabilities(): DeviceCapabilities {
      return {
        isEscl: true,
        submitScanJob: async () => "http://127.0.0.1/eSCL/ScanJobs/1",
        userActionTimeout: 1,
      } as unknown as DeviceCapabilities;
    }

    function mockEsclPage(jpegBody: Buffer): void {
      // the job uri is absolute, so axios ignores the 8080 baseURL here
      nock("http://127.0.0.1")
        .get("/eSCL/ScanJobs/1/NextDocument")
        .reply(200, jpegBody, { "Content-Type": "image/jpeg" });
      nock("http://127.0.0.1")
        .get("/eSCL/ScanJobs/1/ScanImageInfo")
        .reply(200, fs.readFileSync(path.resolve(__dirname, "./asset/eSCL_ScanImageInfo.xml"), "utf-8"));
    }

    it("downloads pages and completes an adf job", async () => {
      const jpegBody = await fsPromises.readFile(
        path.resolve(__dirname, "./asset/adf_bytes_scan.jpg"),
      );
      mockEsclPage(jpegBody);
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(
          200,
          await readAsset("eSCL_ScannerStatus_completed.xml"),
        );

      const api = new DeviceClient("127.0.0.1", false);
      const scanJobContent: ScanContent = { elements: [] };

      const jobState = await executeScanJob(
        api,
        jpegSettings(),
        InputSource.Adf,
        tempDir,
        tempDir,
        0,
        scanJobContent,
        "scan",
        PageCountingStrategy.Normal,
        esclCapabilities(),
      );

      expect(jobState).to.equal(JobState.Completed);
      expect(scanJobContent.elements).to.have.lengthOf(1);
      const page = scanJobContent.elements[0];
      expect(page.width).to.equal(1700);
      // the adf height advertised by the DNL marker overrides the image info
      expect(page.height).to.equal(2322);
    });

    it("marks the job as canceled when the status does not know the job", async () => {
      const jpegBody = await fsPromises.readFile(
        path.resolve(__dirname, "./asset/sample.jpg"),
      );
      mockEsclPage(jpegBody);
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_empty.xml"));

      const api = new DeviceClient("127.0.0.1", false);
      const scanJobContent: ScanContent = { elements: [] };

      const jobState = await executeScanJob(
        api,
        jpegSettings(),
        InputSource.Platen,
        tempDir,
        tempDir,
        0,
        scanJobContent,
        "scan",
        PageCountingStrategy.Normal,
        esclCapabilities(),
      );

      expect(jobState).to.equal(JobState.Canceled);
    });
  });

  describe("hp job handling", () => {
    it("stops with a canceled state when the device cancels the job", async () => {
      const api = new DeviceClient("127.0.0.1", false);
      const canceledJob = {
        jobState: JobState.Canceled,
        pageState: null,
        binaryURL: null,
        currentPageNumber: null,
        imageWidth: null,
        imageHeight: null,
        xResolution: null,
        yResolution: null,
      } as unknown as Job;
      api.getJob = async () => canceledJob;

      const capabilities = {
        isEscl: false,
        submitScanJob: async () => "http://127.0.0.1/Scan/Jobs/1",
      } as unknown as DeviceCapabilities;
      const scanJobContent: ScanContent = { elements: [] };

      const jobState = await executeScanJob(
        api,
        jpegSettings(),
        InputSource.Adf,
        tempDir,
        tempDir,
        0,
        scanJobContent,
        "scan",
        PageCountingStrategy.Normal,
        capabilities,
      );

      expect(jobState).to.equal(JobState.Canceled);
      expect(scanJobContent.elements).to.have.lengthOf(0);
    });
  });

  describe("handleScanProcessingState", () => {
    it("waits and returns null when the page state is unknown", async () => {
      const api = new DeviceClient("127.0.0.1", false);
      const job = { pageState: "SomethingUnexpected" } as unknown as Job;

      const page = await handleScanProcessingState(
        api,
        job,
        jpegSettings(),
        InputSource.Platen,
        tempDir,
        tempDir,
        0,
        1,
        undefined,
        new Date(),
      );

      expect(page).to.equal(null);
    });

    it("downloads raw pages and converts them for non jpeg formats", async () => {
      const api = new DeviceClient("127.0.0.1", false);
      nock("http://127.0.0.1:8080")
        .get("/Scan/Jobs/1/Pages/1")
        .reply(200, Buffer.alloc(8 * 8 * 3, 128), {
          "Content-Type": "application/octet-stream",
        });

      const job = {
        jobState: JobState.Processing,
        pageState: PageState.ReadyToUpload,
        binaryURL: "/Scan/Jobs/1/Pages/1",
        currentPageNumber: 1,
        imageWidth: 8,
        imageHeight: 8,
        xResolution: 200,
        yResolution: 200,
      } as unknown as Job;
      const settings = {
        format: createImageFormat(ScanFormat.Bmp),
        mode: "Color",
        xResolution: 200,
        yResolution: 200,
      } as unknown as IScanJobSettings;

      const page = await handleScanProcessingState(
        api,
        job,
        settings,
        InputSource.Adf,
        tempDir,
        tempDir,
        0,
        1,
        undefined,
        new Date(),
      );

      expect(page).to.not.equal(null);
      expect(page?.path.endsWith(".bmp")).to.equal(true);
      expect(fs.existsSync(page?.path ?? "")).to.equal(true);
    });
  });
});
