export enum ScanFormat {
  "Jpeg" = "Jpeg",
  "Bmp" = "Bmp",
}

export function parseScanFormat(value: string): ScanFormat | undefined {
  const lowerValue = value.toLowerCase();
  if (lowerValue === "jpeg") {
    return ScanFormat.Jpeg;
  }
  if (lowerValue === "bmp") {
    return ScanFormat.Bmp;
  }
  return undefined;
}