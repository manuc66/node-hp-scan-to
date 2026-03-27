export enum ScanFormat {
  "Jpeg" = "Jpeg",
  "Bmp" = "Bmp",
  "Ppm" = "Ppm",
  "Raw" = "Raw",
}

export function parseScanFormat(value: string): ScanFormat | undefined {
  const lowerValue = value.toLowerCase();
  if (lowerValue === "jpeg") {
    return ScanFormat.Jpeg;
  }
  if (lowerValue === "bmp") {
    return ScanFormat.Bmp;
  }
  if (lowerValue === "ppm") {
    return ScanFormat.Ppm;
  }
  if (lowerValue === "raw" || lowerValue === "binary") {
    return ScanFormat.Raw;
  }
  return undefined;
}
