export interface ScanContent {
  elements: ScanPage[];
}
export interface ScanPage {
  path: string;
  pageNumber: number;
  width: number;
  height: number;
  xResolution: number;
  yResolution: number;
}
