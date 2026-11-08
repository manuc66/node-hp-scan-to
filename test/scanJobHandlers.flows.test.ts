import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import DeviceClient from "../src/DeviceClient.js";
import { executeScanJob } from "../src/scanJobHandlers.js";
import { HpScanJobHandler } from "../src/scanJobs/HpScanJobHandler.js";
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
    if (!nock.isActive()) {
      nock.activate();
    }
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
      // Job URI is absolute, so it overrides the base URL (port 80); the base
      // is only used for relative job URLs.
      nock("http://127.0.0.1")
        .get("/eSCL/ScanJobs/1/NextDocument")
        .reply(200, jpegBody, { "Content-Type": "image/jpeg" });
      nock("http://127.0.0.1")
        .get("/eSCL/ScanJobs/1/ScanImageInfo")
        .reply(
          200,
          fs.readFileSync(
            path.resolve(__dirname, "./asset/eSCL_ScanImageInfo.xml"),
            "utf-8",
          ),
        );
    }

    it("downloads pages and completes an adf job", async () => {
      const jpegBody = await fsPromises.readFile(
        path.resolve(__dirname, "./asset/adf_bytes_scan.jpg"),
      );
      mockEsclPage(jpegBody);
      // Once the page has been handed over, /NextDocument answers 404: that
      // is the end of the transfer, whatever the job state says.
      nock("http://127.0.0.1").get("/eSCL/ScanJobs/1/NextDocument").reply(404);
      // The job is still scanning on the first poll, so a page is downloaded;
      // the following poll still reports completion, but only the 404 above
      // ends the loop.
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_scanning.xml"))
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_completed.xml"));

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

    it("keeps polling when the job is Processing with ImagesToTransfer=0", async () => {
      const jpegBody = await fsPromises.readFile(
        path.resolve(__dirname, "./asset/adf_bytes_scan.jpg"),
      );
      mockEsclPage(jpegBody);
      // The job stays in Processing with ImagesToTransfer=0 (a real-world
      // intermediate state); only the /NextDocument 404 ends the transfer.
      nock("http://127.0.0.1").get("/eSCL/ScanJobs/1/NextDocument").reply(404);
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(
          200,
          await readAsset(
            "eSCL_ScannerStatus_processing_noImagesToTransfer.xml",
          ),
        )
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_completed.xml"));

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
    });

    it("does not stop on a Completed status while a page is still available", async () => {
      // The 404 from /NextDocument is the only end-of-transfer signal. A
      // status that flips to Completed early (race, firmware inconsistency)
      // must not make the client drop the last page.
      const jpegBody = await fsPromises.readFile(
        path.resolve(__dirname, "./asset/sample.jpg"),
      );
      mockEsclPage(jpegBody);
      nock("http://127.0.0.1").get("/eSCL/ScanJobs/1/NextDocument").reply(404);
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_completed.xml"))
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_completed.xml"));

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
    });

    it("treats a ProcessingStopped job as canceled", async () => {
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.63</pwg:Version>
  <pwg:State>Processing</pwg:State>
  <scan:Jobs>
    <scan:JobInfo>
      <pwg:JobUri>/eSCL/ScanJobs/1</pwg:JobUri>
      <pwg:JobUuid>job-1</pwg:JobUuid>
      <scan:Age>0</scan:Age>
      <pwg:ImagesCompleted>0</pwg:ImagesCompleted>
      <pwg:ImagesToTransfer>1</pwg:ImagesToTransfer>
      <pwg:JobState>ProcessingStopped</pwg:JobState>
      <pwg:JobStateReasons>
        <pwg:JobStateReason>JobScanning</pwg:JobStateReason>
      </pwg:JobStateReasons>
    </scan:JobInfo>
  </scan:Jobs>
</scan:ScannerStatus>`,
        );

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
      expect(scanJobContent.elements).to.have.lengthOf(0);
    });

    it("ends the job when /NextDocument answers 404 (jpeg)", async () => {
      // Some firmwares keep the job in Processing/JobScanning even after the
      // last page was handed over; the 404 from /NextDocument is then the
      // only reliable end-of-job signal and must not abort the scan.
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_scanning.xml"))
        .get("/eSCL/ScanJobs/1/NextDocument")
        .reply(404);

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
      expect(scanJobContent.elements).to.have.lengthOf(0);
      // The reserved destination file must not survive the 404.
      expect(fs.readdirSync(tempDir)).to.be.empty;
    });

    it("ends the job when /NextDocument answers 404 (raw formats)", async () => {
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_scanning.xml"))
        .get("/eSCL/ScanJobs/1/NextDocument")
        .reply(404);

      const api = new DeviceClient("127.0.0.1", false);
      const scanJobContent: ScanContent = { elements: [] };
      const bmpSettings = {
        format: createImageFormat(ScanFormat.Bmp),
        mode: "Color",
        xResolution: 200,
        yResolution: 200,
      } as unknown as IScanJobSettings;

      const jobState = await executeScanJob(
        api,
        bmpSettings,
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
      expect(scanJobContent.elements).to.have.lengthOf(0);
      expect(fs.readdirSync(tempDir)).to.be.empty;
    });

    it("downloads eSCL pages on port 80 for relative job URLs", async () => {
      const jpegBody = await fsPromises.readFile(
        path.resolve(__dirname, "./asset/adf_bytes_scan.jpg"),
      );

      // eSCL manifest with a relative resource URI -> JobUri is relative,
      // so the base URL (port 80) must be used to reach /NextDocument.
      nock("http://127.0.0.1")
        .get("/eSCL/eSclManifest.xml")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/04/30" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/resourcemap/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <map:ResourceMap>
    <map:ResourceLink>
      <dd:ResourceURI>http://127.0.0.1</dd:ResourceURI>
    </map:ResourceLink>
    <map:ResourceNode>
      <map:ResourceType>
        <scan:ScanResourceType>ScannerCapabilities</scan:ScanResourceType>
      </map:ResourceType>
      <map:ResourceLink>
        <dd:ResourceURI>/eSCL/ScannerCapabilities.xml</dd:ResourceURI>
      </map:ResourceLink>
    </map:ResourceNode>
  </map:ResourceMap>
</man:Manifest>`,
        );
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerCapabilities.xml")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MaxHeight>3508</scan:MaxHeight>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`,
        );

      // ScannerStatus reports a relative JobUri; /NextDocument is fetched via
      // the base URL, so the request must land on port 80.
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.5</pwg:Version>
  <pwg:State>Processing</pwg:State>
  <scan:AdfState>ScannerAdfLoaded</scan:AdfState>
  <scan:Jobs>
    <scan:JobInfo>
      <pwg:JobUri>/eSCL/ScanJobs/1</pwg:JobUri>
      <pwg:JobUuid>1876-0001</pwg:JobUuid>
      <scan:Age>0</scan:Age>
      <pwg:ImagesCompleted>0</pwg:ImagesCompleted>
      <pwg:ImagesToTransfer>1</pwg:ImagesToTransfer>
      <pwg:JobState>Processing</pwg:JobState>
      <pwg:JobStateReasons>
        <pwg:JobStateReason>JobScanning</pwg:JobStateReason>
      </pwg:JobStateReasons>
    </scan:JobInfo>
  </scan:Jobs>
</scan:ScannerStatus>`,
        )
        .get("/eSCL/ScanJobs/1/NextDocument")
        .reply(200, jpegBody, { "Content-Type": "image/jpeg" })
        .get("/eSCL/ScanJobs/1/ScanImageInfo")
        // This scope only answers http://127.0.0.1, and nock keys scopes on
        // the full origin including the port, so this interceptor matches
        // only when the request went to port 80 — not to 8080.
        .reply(
          200,
          fs.readFileSync(
            path.resolve(__dirname, "./asset/eSCL_ScanImageInfo.xml"),
            "utf-8",
          ),
        )
        .get("/eSCL/ScannerStatus")
        .reply(200, await readAsset("eSCL_ScannerStatus_completed.xml"))
        .get("/eSCL/ScanJobs/1/NextDocument")
        .reply(404);

      const api = new DeviceClient("127.0.0.1", false);
      const scanJobContent: ScanContent = { elements: [] };

      const capabilities = {
        isEscl: true,
        submitScanJob: async () => "/eSCL/ScanJobs/1",
        userActionTimeout: 1,
      } as unknown as DeviceCapabilities;

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

      expect(jobState).to.equal(JobState.Completed);
      expect(scanJobContent.elements).to.have.lengthOf(1);
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
      const handler = new HpScanJobHandler({
        api,
        scanJobSettings: jpegSettings(),
        inputSource: InputSource.Platen,
        folder: tempDir,
        tempFolder: tempDir,
        scanCount: 0,
        scanJobContent: { elements: [] },
        filePattern: undefined,
        pageCountingStrategy: PageCountingStrategy.Normal,
      });

      const page = await handler.handleScanProcessingState(job, 1);

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
      const handler = new HpScanJobHandler({
        api,
        scanJobSettings: settings,
        inputSource: InputSource.Adf,
        folder: tempDir,
        tempFolder: tempDir,
        scanCount: 0,
        scanJobContent: { elements: [] },
        filePattern: undefined,
        pageCountingStrategy: PageCountingStrategy.Normal,
      });

      const page = await handler.handleScanProcessingState(job, 1);

      expect(page).to.not.equal(null);
      expect(page?.path.endsWith(".bmp")).to.equal(true);
      expect(fs.existsSync(page?.path ?? "")).to.equal(true);
    });
  });
});
