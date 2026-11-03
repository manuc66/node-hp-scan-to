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
  /** Human-readable destination label shown on the printer. */
  label: string;
  /** Stable device identifier of the destination (correlates events). */
  resourceURI: string;
}

export interface ScanSettingsInfo {
  inputSource: InputSource;
  contentType: "Document" | "Photo";
  /** Format delivered to the caller, e.g. "pdf" or "jpg". */
  format: string;
  /** Format requested to the device, e.g. "jpg" (may differ after compression). */
  sourceFormat: string;
  mode: ScanMode;
  /** Bits per channel (8 for Color/Gray, 1 for Lineart). */
  colorDepth: number;
  /** Number of color channels (3 for Color, 1 otherwise). */
  channels: number;
  resolution: number;
  isDuplex: boolean;
  /** Resolved duplex mode for the scan (set by listen, e.g. emulated duplex). */
  duplexMode?: DuplexMode;
  /** Duplex mode requested to the device (set by listen). */
  targetDuplexMode?: TargetDuplexMode;
  /** Assembly mode used for emulated duplex scans (set by listen). */
  duplexAssemblyMode?: DuplexAssemblyMode;
  pageCountingStrategy: PageCountingStrategy;
  paperSize: string | undefined;
  /** Explicit paper dimensions when known (e.g. "21x29.7cm"). */
  paperDim: string | undefined;
}

export interface ScanInstanceInfo {
  /** Random id generated once per running process (a running instance of this CLI). */
  id: string;
  /** Timestamp the process started (ISO string). */
  startedAt: string;
}

export interface ScanJobSummary {
  /** Outcome of the scan as a whole (state of the last device job). */
  state: JobState;
  /** Number of device jobs that produced this scan (usually 1). */
  count: number;
}

/**
 * Metadata describing a scan. Populated in scanProcessing.ts and exposed in
 * the webhook event; only fields useful to a consumer of the event are kept.
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
  /** Filled in when the event is emitted (ISO 8601). */
  endedAt?: string;
  /** Scan duration in ms (event emission time minus startedAt). */
  durationMs?: number;
}