import type { ScanMetadata } from "./ScanMetadata.js";

export interface ScanContent {
  elements: ScanPage[];
  meta?: ScanMetadata;
}
export interface ScanPage {
  path: string;
  pageNumber: number;
  width: number;
  height: number;
  xResolution: number;
  yResolution: number;
  capturedAt?: string;
  durationMs?: number;
  /** Content-type actually received from the device for this page. */
  contentType?: string;
}