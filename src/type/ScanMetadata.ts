import type { InputSource } from "./InputSource.js";
import type { PageCountingStrategy } from "./pageCountingStrategy.js";
import type { ScanMode } from "./scanMode.js";
import type { JobState } from "../hpModels/Job.js";
import type { DuplexAssemblyMode } from "./DuplexAssemblyMode.js";
import type { DuplexMode } from "./duplexMode.js";
import type { TargetDuplexMode } from "./targetDuplexMode.js";

export type ScanCommand = "single-scan" | "listen" | "adf-autoscan";

export interface ScanDeviceInfo {
  ip: string;
  /** True when the device was reached through the eSCL protocol. */
  isEscl: boolean;
}

export interface ScanTargetInfo {
  label: string;
  resourceURI: string;
  destinationURI: string | undefined;
  agingStamp: string;
  compEventURI: string | undefined;
}

export interface ScanSettingsInfo {
  inputSource: InputSource;
  contentType: "Document" | "Photo";
  /** Format delivered to the caller, e.g. "pdf" or "jpg". */
  format: string;
  /** Image format requested to the device, e.g. "jpg". */
  sourceFormat: string;
  mode: ScanMode;
  /** Bits per channel (8 for Color/Gray, 1 for Lineart). */
  colorDepth: number;
  /** Number of color channels (3 for Color, 1 otherwise). */
  channels: number;
  resolution: number;
  width: number | null;
  height: number | null;
  isDuplex: boolean;
  /** Resolved duplex mode for the scan (set by listen, e.g. emulated duplex). */
  duplexMode?: DuplexMode;
  /** Duplex mode requested to the device (set by listen). */
  targetDuplexMode?: TargetDuplexMode;
  /** Assembly mode used for emulated duplex scans (set by listen). */
  duplexAssemblyMode?: DuplexAssemblyMode;
  pageCountingStrategy: PageCountingStrategy;
  filePattern: string | undefined;
  paperSize: string | undefined;
  paperDim: string | undefined;
  paperOrientation: "portrait" | "landscape" | undefined;
}

export interface ScanInstanceInfo {
  /** Random id generated once per running process (a running instance of this CLI). */
  id: string;
  /** Timestamp the process started (ISO string). */
  startedAt: string;
  /** Process uptime at the moment the metadata was built, in ms. */
  uptimeMs: number;
}

export interface ScanJobInfo {
  state: JobState;
  /** Device job uri (eSCL pwg:JobUri, or the HP job url). */
  uri: string | null;
  /** Device job uuid (only provided by eSCL devices, otherwise null). */
  uuid: string | null;
}

export interface ScanJobSummary {
  /** Outcome of the scan as a whole (state of the last device job). */
  state: JobState;
  /** Number of device jobs that produced this scan (usually 1). */
  count: number;
  /** One entry per device job (emulated duplex and multi-page platen yield several). */
  jobs: ScanJobInfo[];
}

/**
 * Metadata describing a scan, split from ScanContent.elements so that the
 * raw page data stays focused. Populated in scanProcessing.ts and currently
 * consumed by logs only (a webhook projection may reuse it later).
 */
export interface ScanMetadata {
  command: ScanCommand;
  scanCount: number;
  device: ScanDeviceInfo;
  target: ScanTargetInfo | undefined;
  settings: ScanSettingsInfo;
  startedAt: string;
  /** Identifies the CLI run that produced this scan. */
  instance: ScanInstanceInfo;
  /** Device jobs that produced this scan, filled as they run. */
  job?: ScanJobSummary;
}