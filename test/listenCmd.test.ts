import { expect } from "chai";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import { describe, it, beforeEach, afterEach } from "mocha";
import nock from "nock";
import DeviceClient from "../src/DeviceClient.js";
import {
  assembleDuplexScan,
  listenCmd,
  processScanWithDestination,
  handleScanResult,
  determineDuplexModes,
  setupScanParameters,
  processFinishedPartialDuplexScan,
  type FrontOfDoubleSidedScanContext,
} from "../src/commands/listenCmd.js";
import { DuplexAssemblyMode } from "../src/type/DuplexAssemblyMode.js";
import type { ScanConfig } from "../src/type/scanConfigs.js";
import { ScanMode } from "../src/type/scanMode.js";
import { ScanFormat } from "../src/type/scanFormat.js";
import { DuplexMode } from "../src/type/duplexMode.js";
import { TargetDuplexMode } from "../src/type/targetDuplexMode.js";
import { ScanPlexMode } from "../src/hpModels/ScanPlexMode.js";
import { PageCountingStrategy } from "../src/type/pageCountingStrategy.js";
import type { WalkupDestination } from "../src/scanProcessing.js";
import { KnownShortcut } from "../src/type/KnownShortcut.js";
import type { SelectedScanTarget } from "../src/type/scanTargetDefinitions.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import { InputSource } from "../src/type/InputSource.js";
import { ScannerState } from "../src/hpModels/ScannerState.js";
import { AdfState } from "../src/hpModels/AdfState.js";
import PathHelper from "../src/PathHelper.js";
import { fileURLToPath } from "url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── XML Fixtures ──────────────────────────────────────────────────────────────
// Centralised so any schema change is a one-line edit, not a grep-and-replace.

const XML = {
  discoveryTree: `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree
    xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/2007/09/21"
    xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <ledm:ManifestURI>/Scan/ScanJobManifest</ledm:ManifestURI>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,

  scanJobManifest: `<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest
    xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24"
    xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/map/2009/03/24"
    xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"
    xmlns:scan="http://www.hp.com/schemas/imaging/con/ledm/scan/2008/11/17">
  <map:ResourceMap>
    <map:ResourceLink><dd:ResourceURI>http://127.0.0.1</dd:ResourceURI></map:ResourceLink>
    <map:ResourceNode>
      <map:ResourceLink><dd:ResourceURI>/Scan/ScanCaps</dd:ResourceURI></map:ResourceLink>
      <map:ResourceType><scan:ScanResourceType>ScanCaps</scan:ScanResourceType></map:ResourceType>
    </map:ResourceNode>
    <map:ResourceNode>
      <map:ResourceLink><dd:ResourceURI>/Scan/Status</dd:ResourceURI></map:ResourceLink>
      <map:ResourceType><scan:ScanResourceType>Status</scan:ScanResourceType></map:ResourceType>
    </map:ResourceNode>
  </map:ResourceMap>
</man:Manifest>`,

  scanCaps: `<?xml version="1.0" encoding="UTF-8"?>
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/ledm/scancaps/2008/11/17">
  <PlatenMaxWidth>2550</PlatenMaxWidth>
  <PlatenMaxHeight>3300</PlatenMaxHeight>
</ScanCaps>`,

  walkupDestinationsEmpty: `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanDestinations
    xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscandestinations/2009/03/12">
</wus:WalkupScanDestinations>`,

  scanStatusIdle: `<?xml version="1.0" encoding="UTF-8"?>
<ScanStatus>
  <ScannerState>Idle</ScannerState>
  <AdfState>Empty</AdfState>
</ScanStatus>`,

  eventTableEmpty: `<?xml version="1.0" encoding="UTF-8"?>
<ev:EventTable
    xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16"
    xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <dd:Version><dd:Revision>1</dd:Revision></dd:Version>
</ev:EventTable>`,

  walkupScanToCompEventPagesComplete: `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanToCompEvent
    xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28">
  <wus:WalkupScanToCompEventType>ScanPagesComplete</wus:WalkupScanToCompEventType>
</wus:WalkupScanToCompEvent>`,

  scanJobProcessing: (
    jobId = "123",
    pageNumber = 1,
  ) => `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Processing</j:JobState>
  <ScanJob>
    <PreScanPage>
      <PageState>ReadyToUpload</PageState>
      <BinaryURL>/Scan/Jobs/${jobId}/Pages/${pageNumber}</BinaryURL>
      <PageNumber>${pageNumber}</PageNumber>
      <BufferInfo>
        <ImageWidth>100</ImageWidth>
        <ImageHeight>200</ImageHeight>
        <ScanSettings>
          <InputSource>Platen</InputSource>
          <ContentType>Photo</ContentType>
          <XResolution>300</XResolution>
          <YResolution>300</YResolution>
        </ScanSettings>
      </BufferInfo>
    </PreScanPage>
  </ScanJob>
</j:Job>`,

  scanJobCompleted: (pageNumber = 1) => `<?xml version="1.0" encoding="UTF-8"?>
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/job/2009/03/24">
  <j:JobState>Completed</j:JobState>
  <ScanJob>
    <PostScanPage><PageNumber>${pageNumber}</PageNumber></PostScanPage>
  </ScanJob>
</j:Job>`,

  /** A simplex scan event (no compEventURI). destinationId defaults to "1". */
  scanEventSimple: (
    destinationId = "1",
    agingStamp = "1-1",
  ) => `<?xml version="1.0" encoding="UTF-8"?>
<ev:EventTable
    xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16"
    xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <dd:Version><dd:Revision>1</dd:Revision></dd:Version>
  <ev:Event>
    <dd:UnqualifiedEventCategory>ScanEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>${agingStamp}</dd:AgingStamp>
    <ev:Payload>
      <dd:ResourceURI>http://127.0.0.1:80/WalkupScan/Destinations/${destinationId}</dd:ResourceURI>
      <dd:ResourceType>hpCnxWalkupScanDestinations</dd:ResourceType>
    </ev:Payload>
  </ev:Event>
</ev:EventTable>`,

  /** A WalkupScanToComp scan event (includes compEventURI payload). */
  scanEventWithCompUri: (
    destinationId = "1",
    agingStamp = "1-1",
  ) => `<?xml version="1.0" encoding="UTF-8"?>
<ev:EventTable
    xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16"
    xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <dd:Version><dd:Revision>1</dd:Revision></dd:Version>
  <ev:Event>
    <dd:UnqualifiedEventCategory>ScanEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>${agingStamp}</dd:AgingStamp>
    <ev:Payload>
      <dd:ResourceURI>http://127.0.0.1:80/WalkupScan/Destinations/${destinationId}</dd:ResourceURI>
      <dd:ResourceType>hpCnxWalkupScanDestinations</dd:ResourceType>
    </ev:Payload>
    <ev:Payload>
      <dd:ResourceURI>/WalkupScanToComp/WalkupScanToCompEvent</dd:ResourceURI>
      <dd:ResourceType>hpCnxWalkupScanToCompEvent</dd:ResourceType>
    </ev:Payload>
  </ev:Event>
</ev:EventTable>`,

  walkupDestination: (
    opts: {
      id?: string;
      name?: string;
      hostname?: string;
      plexMode?: string;
      shortcut?: string;
    } = {},
  ) => {
    const {
      id = "1",
      name = "test",
      hostname = "test",
      plexMode = "Simplex",
      shortcut = "SaveJPEG",
    } = opts;
    return `<?xml version="1.0" encoding="UTF-8"?>
<wus:WalkupScanDestinations
    xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21"
    xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"
    xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06"
    xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17">
  <wus:WalkupScanDestination>
    <dd:ResourceURI>http://127.0.0.1/WalkupScan/Destinations/${id}</dd:ResourceURI>
    <dd:Name>${name}</dd:Name>
    <dd3:Hostname>${hostname}</dd3:Hostname>
    <wus:WalkupScanSettings>
      <scantype:ScanSettings>
        <dd:ScanPlexMode>${plexMode}</dd:ScanPlexMode>
      </scantype:ScanSettings>
      <wus:Shortcut>${shortcut}</wus:Shortcut>
    </wus:WalkupScanSettings>
  </wus:WalkupScanDestination>
</wus:WalkupScanDestinations>`;
  },
};

// ─── Builders / Factories ──────────────────────────────────────────────────────

const makeScanPage = (overrides: Partial<ScanPage> = {}): ScanPage => ({
  path: "default.png",
  pageNumber: 1,
  width: 100,
  height: 200,
  xResolution: 300,
  yResolution: 300,
  ...overrides,
});

const makeScanContent = (pages: Partial<ScanPage>[]): ScanContent => ({
  elements: pages.map(makeScanPage),
});

/** Convenience: build an n-page front or back scan with predictable path names. */
const makePagedContent = (prefix: string, count: number): ScanContent =>
  makeScanContent(
    Array.from({ length: count }, (_, i) => ({
      path: `${prefix}${i + 1}.png`,
      pageNumber: i + 1,
    })),
  );

const makeScanConfig = (
  dir: string,
  overrides: Partial<ScanConfig> = {},
): ScanConfig => ({
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
  paperlessConfig: undefined,
  nextcloudConfig: undefined,
  s3Config: undefined,
  preferEscl: false,
  paperSize: undefined,
  paperDim: undefined,
  paperOrientation: undefined,
  ...overrides,
});

const makeScanEvent = (
  overrides: Partial<{
    unqualifiedEventCategory: string;
    agingStamp: string;
    destinationURI: string | undefined;
    compEventURI: string | undefined;
    isScanEvent: boolean;
  }> = {},
) => ({
  unqualifiedEventCategory: "ScanEvent",
  agingStamp: "0",
  destinationURI: "/WalkupScan/Destinations/1",
  compEventURI: undefined,
  isScanEvent: true,
  ...overrides,
});

const makeDestination = (
  overrides: Partial<WalkupDestination> = {},
): WalkupDestination => ({
  shortcut: KnownShortcut.SaveJPEG,
  scanPlexMode: null,
  ...overrides,
});

const makeScanTarget = (
  overrides: Partial<SelectedScanTarget> = {},
): SelectedScanTarget => ({
  resourceURI: "/WalkupScan/Destinations/1",
  label: "test",
  isDuplexSingleSide: false,
  event: makeScanEvent(),
  ...overrides,
});

const makeDeviceCapabilities = (
  overrides: Partial<DeviceCapabilities> = {},
): DeviceCapabilities => ({
  supportsMultiItemScanFromPlaten: false,
  useWalkupScanToComp: false,
  platenMaxWidth: null,
  platenMaxHeight: null,
  adfMaxWidth: null,
  adfMaxHeight: null,
  adfDuplexMaxWidth: null,
  adfDuplexMaxHeight: null,
  hasAdfDuplex: false,
  hasAdfDetectPaperLoaded: false,
  userActionTimeout: null,
  isEscl: false,
  getScanStatus: async () => ({
    scannerState: ScannerState.Idle,
    adfState: AdfState.Empty,
    isLoaded: () => false,
    getInputSource: () => InputSource.Platen,
  }),
  createScanJobSettings: (..._args: unknown[]) =>
    ({
      format: { isJpeg: () => true, getExtension: () => "jpg" },
      mode: ScanMode.Color,
      toXML: async () => "<scanSettings></scanSettings>",
      xResolution: 300,
      yResolution: 300,
    }) as never,
  submitScanJob: async () => "http://127.0.0.1:8080/Scan/Jobs/123",
  ...overrides,
});

const makeFrontContext = (
  dir: string,
  overrides: Partial<FrontOfDoubleSidedScanContext> = {},
): FrontOfDoubleSidedScanContext => ({
  scanConfig: makeScanConfig(dir),
  folder: dir,
  tempFolder: dir,
  scanCount: 1,
  scanJobContent: { elements: [] },
  scanDate: new Date("2024-01-01"),
  scanToPdf: false,
  ...overrides,
});

// ─── HTTP nock helpers ─────────────────────────────────────────────────────────
// Registers the standard LEDM discovery + capability endpoints on port 80.
// Call this at the top of any listenCmd integration test.

const nockLedmBootstrap = () => {
  const scope = nock("http://127.0.0.1:80").persist();
  scope.get("/DevMgmt/DiscoveryTree.xml").reply(200, XML.discoveryTree);
  scope.get("/Scan/ScanJobManifest").reply(200, XML.scanJobManifest);
  scope.get("/Scan/ScanCaps").reply(200, XML.scanCaps);
  scope.get("/Scan/Status").reply(200, XML.scanStatusIdle);
  scope
    .get("/WalkupScan/WalkupScanDestinations")
    .reply(200, XML.walkupDestinationsEmpty);
  scope.post("/WalkupScan/WalkupScanDestinations").reply(201, "", {
    Location: "http://127.0.0.1/WalkupScan/Destinations/1",
  });
};

/** Registers a standard single-page scan job lifecycle on port 8080. */
const nockScanJob = (jobId = "123", pageNumber = 1) => {
  const scope = nock("http://127.0.0.1:8080");
  scope
    .post("/Scan/Jobs")
    .optionally()
    .reply(201, "", {
      Location: `http://127.0.0.1:8080/Scan/Jobs/${jobId}`,
    });
  scope
    .get(`/Scan/Jobs/${jobId}`)
    .times(2)
    .reply(200, XML.scanJobProcessing(jobId, pageNumber));
  scope
    .get(`/Scan/Jobs/${jobId}/Pages/${pageNumber}`)
    .reply(200, Buffer.from("fake-image-data"), {
      "Content-Type": "image/jpeg",
    });
  scope.get(`/Scan/Jobs/${jobId}`).reply(200, XML.scanJobCompleted(pageNumber));
  return scope;
};

// ─── Filesystem helpers ────────────────────────────────────────────────────────

/** Copies the test asset JPEG into a temp dir and returns the written path. */
const writeSampleJpeg = (dir: string, filename = "sample.jpg"): string => {
  const src = path.join(__dirname, "asset/sample.jpg");
  const dest = path.join(dir, filename);
  fs.writeFileSync(dest, fs.readFileSync(src));
  return dest;
};

const makeTempDir = (prefix: string) =>
  fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const removeTempDir = (dir: string) => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// assembleDuplexScan
// ─────────────────────────────────────────────────────────────────────────────

describe("assembleDuplexScan", () => {
  // ── Behavioural (example-based) ───────────────────────────────────────────

  it("PAGE_WISE: interleaves front and back in natural order", () => {
    const front = makePagedContent("front", 2);
    const back = makePagedContent("back", 2);
    const { elements } = assembleDuplexScan(
      front,
      back,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(elements.map((e) => e.path)).to.deep.equal([
      "front1.png",
      "back1.png",
      "front2.png",
      "back2.png",
    ]);
  });

  it("DOCUMENT_WISE: interleaves fronts with reversed backs", () => {
    const front = makePagedContent("front", 2);
    const back = makePagedContent("back", 2);
    const { elements } = assembleDuplexScan(
      front,
      back,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );

    expect(elements.map((e) => e.path)).to.deep.equal([
      "front1.png",
      "back2.png",
      "front2.png",
      "back1.png",
    ]);
  });

  it("REVERSE_FRONT: interleaves reversed fronts with natural backs", () => {
    const front = makePagedContent("front", 2);
    const back = makePagedContent("back", 2);
    const { elements } = assembleDuplexScan(
      front,
      back,
      DuplexAssemblyMode.REVERSE_FRONT,
    );

    expect(elements.map((e) => e.path)).to.deep.equal([
      "front2.png",
      "back1.png",
      "front1.png",
      "back2.png",
    ]);
  });

  it("REVERSE_BOTH: interleaves reversed fronts with reversed backs", () => {
    const front = makePagedContent("front", 2);
    const back = makePagedContent("back", 2);
    const { elements } = assembleDuplexScan(
      front,
      back,
      DuplexAssemblyMode.REVERSE_BOTH,
    );

    expect(elements.map((e) => e.path)).to.deep.equal([
      "front2.png",
      "back2.png",
      "front1.png",
      "back1.png",
    ]);
  });

  it("tolerates a missing last back page (odd-page document)", () => {
    const front = makePagedContent("front", 2);
    const back = makePagedContent("back", 1);
    const { elements } = assembleDuplexScan(
      front,
      back,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(elements.map((e) => e.path)).to.deep.equal([
      "front1.png",
      "back1.png",
      "front2.png",
    ]);
  });

  it("tolerates an entirely missing front scan", () => {
    const front = makeScanContent([]);
    const back = makePagedContent("back", 2);
    const { elements } = assembleDuplexScan(
      front,
      back,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(elements.map((e) => e.path)).to.deep.equal([
      "back1.png",
      "back2.png",
    ]);
  });

  it("returns empty output when both scans are empty", () => {
    const result = assembleDuplexScan(
      makeScanContent([]),
      makeScanContent([]),
      DuplexAssemblyMode.PAGE_WISE,
    );
    expect(result.elements).to.deep.equal([]);
  });

  it("DOCUMENT_WISE: handles unequal page counts (3 fronts, 2 backs)", () => {
    const front = makePagedContent("front", 3);
    const back = makePagedContent("back", 2);
    const { elements } = assembleDuplexScan(
      front,
      back,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );

    // backs reversed → back2, back1; front3 has no matching back
    expect(elements.map((e) => e.path)).to.deep.equal([
      "front1.png",
      "back2.png",
      "front2.png",
      "back1.png",
      "front3.png",
    ]);
  });

  // ── Property-style invariant tests ────────────────────────────────────────
  // These are not full property-based tests (which would need fast-check /
  // similar), but they exhaustively cover the invariants across every mode
  // and several representative sizes, without hardcoding the exact order.

  const ALL_MODES = Object.values(DuplexAssemblyMode) as DuplexAssemblyMode[];

  // Helper: build n-page content with globally unique, distinguishable paths.
  const uniqueContent = (prefix: string, n: number): ScanContent =>
    makeScanContent(
      Array.from({ length: n }, (_, i) => ({
        path: `${prefix}_${i}`,
        pageNumber: i,
      })),
    );

  const runProperty = (
    frontCount: number,
    backCount: number,
    mode: DuplexAssemblyMode,
  ) => {
    const front = uniqueContent("F", frontCount);
    const back = uniqueContent("B", backCount);
    const result = assembleDuplexScan(front, back, mode);
    return { front, back, result };
  };

  for (const mode of ALL_MODES) {
    describe(`mode=${mode}`, () => {
      for (const [fCount, bCount] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [3, 3],
        [4, 3],
        [3, 4],
      ]) {
        it(`[${fCount}F + ${bCount}B] output length = fronts + backs`, () => {
          const { result } = runProperty(fCount, bCount, mode);
          expect(result.elements.length).to.equal(fCount + bCount);
        });

        it(`[${fCount}F + ${bCount}B] no page is lost (all paths present)`, () => {
          const { front, back, result } = runProperty(fCount, bCount, mode);
          const outPaths = result.elements.map((e) => e.path).sort();
          const inPaths = [
            ...front.elements.map((e) => e.path),
            ...back.elements.map((e) => e.path),
          ].sort();
          expect(outPaths).to.deep.equal(inPaths);
        });

        it(`[${fCount}F + ${bCount}B] no page is duplicated`, () => {
          const { result } = runProperty(fCount, bCount, mode);
          const paths = result.elements.map((e) => e.path);
          const unique = new Set(paths);
          expect(unique.size).to.equal(paths.length);
        });
      }
    });
  }

  // Relative order within each stream is preserved for modes that don't reverse.
  it("PAGE_WISE: relative order of fronts is preserved", () => {
    const { front, result } = runProperty(4, 4, DuplexAssemblyMode.PAGE_WISE);
    const outFronts = result.elements
      .filter((e) => e.path.startsWith("F_"))
      .map((e) => e.path);
    expect(outFronts).to.deep.equal(front.elements.map((e) => e.path));
  });

  it("PAGE_WISE: relative order of backs is preserved", () => {
    const { back, result } = runProperty(4, 4, DuplexAssemblyMode.PAGE_WISE);
    const outBacks = result.elements
      .filter((e) => e.path.startsWith("B_"))
      .map((e) => e.path);
    expect(outBacks).to.deep.equal(back.elements.map((e) => e.path));
  });

  it("DOCUMENT_WISE: relative order of fronts is preserved", () => {
    const { front, result } = runProperty(
      4,
      4,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );
    const outFronts = result.elements
      .filter((e) => e.path.startsWith("F_"))
      .map((e) => e.path);
    expect(outFronts).to.deep.equal(front.elements.map((e) => e.path));
  });

  it("DOCUMENT_WISE: backs appear in reversed order", () => {
    const { back, result } = runProperty(
      4,
      4,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );
    const outBacks = result.elements
      .filter((e) => e.path.startsWith("B_"))
      .map((e) => e.path);
    expect(outBacks).to.deep.equal(
      [...back.elements.map((e) => e.path)].reverse(),
    );
  });

  it("REVERSE_FRONT: fronts appear in reversed order", () => {
    const { front, result } = runProperty(
      4,
      4,
      DuplexAssemblyMode.REVERSE_FRONT,
    );
    const outFronts = result.elements
      .filter((e) => e.path.startsWith("F_"))
      .map((e) => e.path);
    expect(outFronts).to.deep.equal(
      [...front.elements.map((e) => e.path)].reverse(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// determineDuplexModes  (pure function — no I/O)
// ─────────────────────────────────────────────────────────────────────────────

describe("determineDuplexModes", () => {
  // Helpers: narrow factories for this suite.
  const simplexDest = () => makeDestination({ scanPlexMode: null });
  const duplexDest = () =>
    makeDestination({ scanPlexMode: ScanPlexMode.Duplex });
  const singleSideTarget = (uri = "/WalkupScan/Destinations/1") =>
    makeScanTarget({ resourceURI: uri, isDuplexSingleSide: true });
  const normalTarget = () => makeScanTarget({ isDuplexSingleSide: false });

  it("scanPlexMode=null, isDuplexSingleSide=false → Simplex / Simplex", () => {
    const { duplexMode, targetDuplexMode } = determineDuplexModes(
      simplexDest(),
      normalTarget(),
      DuplexMode.Simplex,
      undefined,
    );
    expect(duplexMode).to.equal(DuplexMode.Simplex);
    expect(targetDuplexMode).to.equal(TargetDuplexMode.Simplex);
  });

  it("scanPlexMode=Simplex, isDuplexSingleSide=false → Simplex / Simplex", () => {
    const { duplexMode, targetDuplexMode } = determineDuplexModes(
      makeDestination({ scanPlexMode: ScanPlexMode.Simplex }),
      normalTarget(),
      DuplexMode.Simplex,
      undefined,
    );
    expect(duplexMode).to.equal(DuplexMode.Simplex);
    expect(targetDuplexMode).to.equal(TargetDuplexMode.Simplex);
  });

  it("scanPlexMode=Duplex → Duplex / Duplex (overrides isDuplexSingleSide)", () => {
    const { duplexMode, targetDuplexMode } = determineDuplexModes(
      duplexDest(),
      normalTarget(),
      DuplexMode.Simplex,
      undefined,
    );
    expect(duplexMode).to.equal(DuplexMode.Duplex);
    expect(targetDuplexMode).to.equal(TargetDuplexMode.Duplex);
  });

  it("first emulated-duplex scan → FrontOfDoubleSided", () => {
    const { duplexMode, targetDuplexMode } = determineDuplexModes(
      simplexDest(),
      singleSideTarget(),
      DuplexMode.Simplex,
      undefined,
    );
    expect(duplexMode).to.equal(DuplexMode.FrontOfDoubleSided);
    expect(targetDuplexMode).to.equal(TargetDuplexMode.EmulatedDuplex);
  });

  it("same target as last scan + previousMode=Front → BackOfDoubleSided", () => {
    const target = singleSideTarget("/WalkupScan/Destinations/1");
    const { duplexMode, targetDuplexMode } = determineDuplexModes(
      simplexDest(),
      target,
      DuplexMode.FrontOfDoubleSided,
      target,
    );
    expect(duplexMode).to.equal(DuplexMode.BackOfDoubleSided);
    expect(targetDuplexMode).to.equal(TargetDuplexMode.EmulatedDuplex);
  });

  it("same target + previousMode=Back → FrontOfDoubleSided (cycle resets)", () => {
    const target = singleSideTarget("/WalkupScan/Destinations/1");
    const { duplexMode, targetDuplexMode } = determineDuplexModes(
      simplexDest(),
      target,
      DuplexMode.BackOfDoubleSided,
      target,
    );
    expect(duplexMode).to.equal(DuplexMode.FrontOfDoubleSided);
    expect(targetDuplexMode).to.equal(TargetDuplexMode.EmulatedDuplex);
  });

  it("different target from last scan → FrontOfDoubleSided (new document)", () => {
    const current = singleSideTarget("/WalkupScan/Destinations/2");
    const previous = singleSideTarget("/WalkupScan/Destinations/1");
    const { duplexMode } = determineDuplexModes(
      simplexDest(),
      current,
      DuplexMode.FrontOfDoubleSided,
      previous,
    );
    expect(duplexMode).to.equal(DuplexMode.FrontOfDoubleSided);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setupScanParameters  (async but pure — only PathHelper is a dependency)
// ─────────────────────────────────────────────────────────────────────────────

describe("setupScanParameters", () => {
  let originalGetNextScanNumber: typeof PathHelper.getNextScanNumber;

  const cfg = makeScanConfig("/tmp");
  const jpegDest = makeDestination({ shortcut: KnownShortcut.SaveJPEG });
  const pdfDest = makeDestination({ shortcut: KnownShortcut.SavePDF });

  beforeEach(() => {
    originalGetNextScanNumber = PathHelper.getNextScanNumber;
    // Always returns 42 so assertions are deterministic.
    PathHelper.getNextScanNumber = async () => 42;
  });

  afterEach(() => {
    PathHelper.getNextScanNumber = originalGetNextScanNumber;
  });

  it("Simplex + SaveJPEG → Normal counting, not PDF, incremented scan number", async () => {
    const result = await setupScanParameters(
      DuplexMode.Simplex,
      TargetDuplexMode.Simplex,
      jpegDest,
      0,
      "/tmp",
      cfg,
      null,
    );
    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.Normal);
    expect(result.scanToPdf).to.be.false;
    expect(result.scanCount).to.equal(42);
  });

  it("Duplex + SaveJPEG → Normal counting, not PDF", async () => {
    const result = await setupScanParameters(
      DuplexMode.Duplex,
      TargetDuplexMode.Duplex,
      jpegDest,
      0,
      "/tmp",
      cfg,
      null,
    );
    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.Normal);
    expect(result.scanToPdf).to.be.false;
    expect(result.scanCount).to.equal(42);
  });

  it("Duplex + SavePDF → scanToPdf=true", async () => {
    const result = await setupScanParameters(
      DuplexMode.Duplex,
      TargetDuplexMode.Duplex,
      pdfDest,
      0,
      "/tmp",
      cfg,
      null,
    );
    expect(result.scanToPdf).to.be.true;
    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.Normal);
    expect(result.scanCount).to.equal(42);
  });

  it("FrontOfDoubleSided → OddOnly counting, new scan number allocated", async () => {
    const result = await setupScanParameters(
      DuplexMode.FrontOfDoubleSided,
      TargetDuplexMode.EmulatedDuplex,
      jpegDest,
      0,
      "/tmp",
      cfg,
      null,
    );
    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.OddOnly);
    expect(result.scanToPdf).to.be.false;
    expect(result.scanCount).to.equal(42);
  });

  it("BackOfDoubleSided → EvenOnly counting, inherits scan number/date/pdf flag from front context", async () => {
    const frontCtx = makeFrontContext("/tmp", {
      scanCount: 10,
      scanDate: new Date("2024-06-15"),
      scanToPdf: true,
    });
    const result = await setupScanParameters(
      DuplexMode.BackOfDoubleSided,
      TargetDuplexMode.EmulatedDuplex,
      jpegDest,
      0,
      "/tmp",
      cfg,
      frontCtx,
    );
    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.EvenOnly);
    expect(result.scanToPdf).to.be.true;
    expect(result.scanCount).to.equal(10);
    // Same reference — no copy made.
    expect(result.scanDate).to.equal(frontCtx.scanDate);
  });

  it("BackOfDoubleSided with null front context → falls back to safe defaults", async () => {
    // Tests the nullish-coalescing fallback path in setupScanParameters.
    const result = await setupScanParameters(
      DuplexMode.BackOfDoubleSided,
      TargetDuplexMode.EmulatedDuplex,
      jpegDest,
      5,
      "/tmp",
      cfg,
      null,
    );
    expect(result.pageCountingStrategy).to.equal(PageCountingStrategy.EvenOnly);
    expect(result.scanToPdf).to.be.false;
    // scanCount falls back to the passed-in value when no context.
    expect(result.scanCount).to.equal(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleScanResult
// ─────────────────────────────────────────────────────────────────────────────

describe("handleScanResult", () => {
  const FIXED_DATE = new Date("2024-01-01");

  // FrontOfDoubleSided is pure context-capture — no I/O needed.
  it("FrontOfDoubleSided: captures all inputs into a new context, returns it", async () => {
    const cfg = makeScanConfig("/tmp");
    const content = makeScanContent([{ path: "p1.png" }]);
    const result = await handleScanResult(
      DuplexMode.FrontOfDoubleSided,
      null,
      cfg,
      "/tmp",
      "/tmp",
      7,
      content,
      FIXED_DATE,
      true,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );

    expect(result).to.not.be.null;
    expect(result?.scanConfig).to.equal(cfg);
    expect(result?.folder).to.equal("/tmp");
    expect(result?.tempFolder).to.equal("/tmp");
    expect(result?.scanCount).to.equal(7);
    expect(result?.scanJobContent).to.equal(content);
    expect(result?.scanDate).to.equal(FIXED_DATE);
    expect(result?.scanToPdf).to.be.true;
  });

  // Simplex and BackOfDoubleSided both write output — need a real temp dir + JPEG.
  describe("modes that invoke postProcessing", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = makeTempDir("handleScanResult-");
    });
    afterEach(() => removeTempDir(tempDir));

    it("Simplex: returns null and writes output PDF", async () => {
      const jpegPath = writeSampleJpeg(tempDir, "page1.jpg");
      const cfg = makeScanConfig(tempDir);
      const result = await handleScanResult(
        DuplexMode.Simplex,
        null,
        cfg,
        tempDir,
        tempDir,
        1,
        makeScanContent([{ path: jpegPath }]),
        FIXED_DATE,
        true,
        DuplexAssemblyMode.DOCUMENT_WISE,
      );

      expect(result).to.be.null;
      expect(fs.existsSync(path.join(tempDir, "scan1.pdf"))).to.be.true;
    });

    it("BackOfDoubleSided: assembles front+back, writes merged PDF, returns (unchanged) front context", async () => {
      const frontPath = writeSampleJpeg(tempDir, "front1.jpg");
      const backPath = writeSampleJpeg(tempDir, "back1.jpg");
      const cfg = makeScanConfig(tempDir);

      const frontCtx = makeFrontContext(tempDir, {
        scanConfig: cfg,
        scanCount: 2,
        scanToPdf: true,
        scanDate: FIXED_DATE,
        scanJobContent: makeScanContent([{ path: frontPath }]),
      });

      const result = await handleScanResult(
        DuplexMode.BackOfDoubleSided,
        frontCtx,
        cfg,
        tempDir,
        tempDir,
        2,
        makeScanContent([{ path: backPath }]),
        FIXED_DATE,
        true,
        DuplexAssemblyMode.DOCUMENT_WISE,
      );

      // The function returns the front context object reference unchanged.
      expect(result).to.equal(frontCtx);
      expect(fs.existsSync(path.join(tempDir, "scan2.pdf"))).to.be.true;
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// processFinishedPartialDuplexScan
// ─────────────────────────────────────────────────────────────────────────────

describe("processFinishedPartialDuplexScan", () => {
  it("flushes the front context via postProcessing and produces a PDF", async () => {
    const tempDir = makeTempDir("processFinished-");

    try {
      const jpegPath = writeSampleJpeg(tempDir, "scan1_page1.jpg");
      const frontCtx = makeFrontContext(tempDir, {
        scanConfig: makeScanConfig(tempDir),
        scanCount: 1,
        scanToPdf: true,
        scanJobContent: makeScanContent([{ path: jpegPath }]),
      });

      await processFinishedPartialDuplexScan(
        makeScanTarget({ resourceURI: "/dest/1", isDuplexSingleSide: true }),
        makeScanTarget({ resourceURI: "/dest/2", isDuplexSingleSide: true }),
        1,
        frontCtx,
      );

      expect(fs.existsSync(path.join(tempDir, "scan1.pdf"))).to.be.true;
    } finally {
      removeTempDir(tempDir);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// processScanWithDestination
// ─────────────────────────────────────────────────────────────────────────────

describe("processScanWithDestination", () => {
  let api: DeviceClient;
  let tempDir: string;
  let originalGetNextScanNumber: typeof PathHelper.getNextScanNumber;

  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.disableNetConnect();
    api = new DeviceClient("127.0.0.1", false);
    api.isAlive = async () => true;
    api.delay = async () => {
      /* noop */
    };
    api.waitDeviceUp = async () => {
      /* noop */
    };

    originalGetNextScanNumber = PathHelper.getNextScanNumber;
    PathHelper.getNextScanNumber = async (_f, current) => current + 1;

    tempDir = makeTempDir("processScan-");
  });

  afterEach(() => {
    PathHelper.getNextScanNumber = originalGetNextScanNumber;
    nock.cleanAll();
    removeTempDir(tempDir);
  });

  it("Simplex scan: returns Simplex mode, incremented scan count, null duplex context", async () => {
    const jobScope = nockScanJob();

    const result = await processScanWithDestination(
      api,
      makeDestination({ scanPlexMode: null }),
      makeScanTarget({ isDuplexSingleSide: false }),
      DuplexMode.Simplex,
      undefined,
      tempDir,
      tempDir,
      makeScanConfig(tempDir),
      makeDeviceCapabilities(),
      0,
      null,
    );

    expect(result.duplexMode).to.equal(DuplexMode.Simplex);
    expect(result.scanCount).to.equal(1);
    expect(result.frontOfDoubleSidedScanContext).to.be.null;
    expect(jobScope.isDone()).to.be.true;
  });

  it("switching from emulated front to Simplex: flushes partial PDF then scans", async () => {
    const jobScope = nockScanJob();
    const frontJpeg = writeSampleJpeg(tempDir, "front.jpg");

    const result = await processScanWithDestination(
      api,
      makeDestination({ shortcut: KnownShortcut.SaveJPEG, scanPlexMode: null }),
      makeScanTarget({
        resourceURI: "/WalkupScan/Destinations/2",
        isDuplexSingleSide: false,
      }),
      DuplexMode.FrontOfDoubleSided,
      makeScanTarget({
        resourceURI: "/WalkupScan/Destinations/1",
        isDuplexSingleSide: true,
      }),
      tempDir,
      tempDir,
      makeScanConfig(tempDir),
      makeDeviceCapabilities(),
      1,
      makeFrontContext(tempDir, {
        scanCount: 0,
        scanToPdf: true,
        scanJobContent: makeScanContent([{ path: frontJpeg }]),
      }),
    );

    expect(result.duplexMode).to.equal(DuplexMode.Simplex);
    expect(result.scanCount).to.equal(2);
    expect(jobScope.isDone()).to.be.true;
    // The flushed front-only PDF must exist (scan count from frontContext = 0).
    const pdfPath = path.join(tempDir, "scan0.pdf");
    console.log("DEBUG: checking for", pdfPath);
    console.log("DEBUG: tempDir contents:", fs.readdirSync(tempDir));
    console.log("DEBUG: exists?", fs.existsSync(pdfPath));
    expect(fs.existsSync(pdfPath)).to.be.true;
  });

  it("switching from emulated front to Duplex: flushes partial PDF then scans in Duplex mode", async () => {
    const jobScope = nockScanJob();
    const frontJpeg = writeSampleJpeg(tempDir, "front.jpg");

    const result = await processScanWithDestination(
      api,
      makeDestination({ scanPlexMode: ScanPlexMode.Duplex }),
      makeScanTarget({
        resourceURI: "/WalkupScan/Destinations/2",
        isDuplexSingleSide: false,
      }),
      DuplexMode.FrontOfDoubleSided,
      makeScanTarget({
        resourceURI: "/WalkupScan/Destinations/1",
        isDuplexSingleSide: true,
      }),
      tempDir,
      tempDir,
      makeScanConfig(tempDir),
      makeDeviceCapabilities(),
      1,
      makeFrontContext(tempDir, {
        scanCount: 0,
        scanToPdf: true,
        scanJobContent: makeScanContent([{ path: frontJpeg }]),
      }),
    );

    expect(result.duplexMode).to.equal(DuplexMode.Duplex);
    expect(result.scanCount).to.equal(2);
    expect(jobScope.isDone()).to.be.true;
    expect(fs.existsSync(path.join(tempDir, "scan0.pdf"))).to.be.true;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listenCmd  (full integration — exercises the event loop)
// ─────────────────────────────────────────────────────────────────────────────

describe("listenCmd", () => {
  let api: DeviceClient;
  let tempDir: string;

  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.disableNetConnect();
    api = new DeviceClient("127.0.0.1", false);
    api.isAlive = async () => true;
    api.delay = async () => {
      /* noop */
    };
    api.waitDeviceUp = async () => {
      /* noop */
    };
    tempDir = makeTempDir("listenCmd-");
  });

  afterEach(() => {
    nock.cleanAll();
    removeTempDir(tempDir);
  });

  it("exits after 50 consecutive errors when device is alive (circuit breaker)", async () => {
    nockLedmBootstrap();
    // Every event-table poll returns 500 → errorCount increments each iteration.
    nock("http://127.0.0.1:80")
      .persist()
      .get("/EventMgmt/EventTable")
      .reply(500);

    const errorsBefore = 0;
    let callCount = 0;
    api.isAlive = async () => {
      callCount++;
      return true;
    };

    await listenCmd(
      api,
      [{ label: "host", isDuplexSingleSide: false }],
      makeScanConfig(tempDir),
      1,
    );

    // isAlive is checked once per failing iteration — must have been called ≥50 times.
    expect(callCount).to.be.greaterThanOrEqual(50);
    void errorsBefore; // suppress unused-variable warning
  });

  it("skips scan when waitScanRequest returns false (ScanPagesComplete event)", async () => {
    nockLedmBootstrap();
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .reply(200, XML.eventTableEmpty, { etag: "e0" });
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .query({ timeout: 1200 })
      .reply(200, XML.scanEventWithCompUri(), { etag: "e1" });
    nock("http://127.0.0.1:80")
      .get("/WalkupScanToComp/WalkupScanToCompEvent")
      .reply(200, XML.walkupScanToCompEventPagesComplete);

    // After the WalkupScanToComp mock is consumed, the next EventTable poll
    // will fail (no mock).  Make isAlive return false so deviceUp = false,
    // then waitDeviceUp throws to exit the loop immediately (no 50-iteration
    // circuit-breaker needed).  No /Scan/Jobs mock is registered, so any
    // attempt to create a scan job would also fail hard with disableNetConnect.
    api.isAlive = async () => false;

    api.waitDeviceUp = async () => {
      throw new Error("device is down");
    };

    try {
      await listenCmd(
        api,
        [{ label: "host", isDuplexSingleSide: false }],
        makeScanConfig(tempDir),
        1,
      );
      expect.fail("Expected listenCmd to reject");
    } catch (e: unknown) {
      expect((e as Error).message).to.equal("device is down");
    }

    // No scan was performed — tempDir should be empty.
    const files = fs.readdirSync(tempDir);
    expect(files).to.have.lengthOf(0);
  });

  it("performs a complete Simplex scan flow end-to-end and writes output file", async () => {
    nockLedmBootstrap();
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .reply(200, XML.eventTableEmpty, { etag: "t0" });
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .query({ timeout: 1200 })
      .reply(200, XML.scanEventSimple(), { etag: "t1" });
    nock("http://127.0.0.1:80")
      .get("/WalkupScan/Destinations/1")
      .reply(200, XML.walkupDestination());

    const jobScope = nockScanJob();

    await listenCmd(
      api,
      [{ label: "host", isDuplexSingleSide: false }],
      makeScanConfig(tempDir),
      1,
    );

    expect(jobScope.isDone()).to.be.true;
    // The scan was saved to tempDir; at least one file should exist.
    const files = fs.readdirSync(tempDir);
    expect(files.length).to.be.greaterThan(0);
  });

  it("catches non-Error throws when device is alive (hits line 111)", async () => {
    nockLedmBootstrap();
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .reply(200, XML.eventTableEmpty, { etag: "t0" });
    nock("http://127.0.0.1:80")
      .get("/EventMgmt/EventTable")
      .query({ timeout: 1200 })
      .reply(200, XML.scanEventWithCompUri(), { etag: "t1" });

    api.getWalkupScanToCompEvent = async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "non-error-throw";
    };

    await listenCmd(
      api,
      [{ label: "host", isDuplexSingleSide: false }],
      makeScanConfig(tempDir),
      1,
    );
  });

  it("logs debug info when device goes down and debug is enabled", async () => {
    nockLedmBootstrap();
    nock("http://127.0.0.1:80")
      .persist()
      .get("/EventMgmt/EventTable")
      .reply(500);

    let isAliveCalls = 0;
    api.isAlive = async () => {
      isAliveCalls++;
      return isAliveCalls > 1;
    };
    api.isDebug = () => true;

    await listenCmd(
      api,
      [{ label: "host", isDuplexSingleSide: false }],
      makeScanConfig(tempDir),
      1,
    );
  });
});
