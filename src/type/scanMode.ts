export enum ScanMode {
  Gray = "Gray",
  Color = "Color",
  Lineart = "Lineart",
}

export function parseScanMode(value: string): ScanMode | undefined {
  const lowerValue = value.toLowerCase();
  if (lowerValue === "gray") {
    return ScanMode.Gray;
  }
  if (lowerValue === "color") {
    return ScanMode.Color;
  }
  if (lowerValue === "lineart") {
    return ScanMode.Lineart;
  }
  return undefined;
}
