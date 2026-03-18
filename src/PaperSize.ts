
/**
 * eSCL ScanRegion unit resolution (1/300 inch), per eSCL specification.
 * ContentRegionUnits is always "ThreeHundredthsOfInches".
 */
export const ESCL_UNIT_RESOLUTION = 300;

/**
 * Paper size in millimeters.
 */
export interface PaperSizeMm {
  widthMm: number;
  heightMm: number;
}

/**
 * Resolved paper size with its human-readable source label (for logging).
 */
export interface ResolvedPaperSize {
  resolvedMm: PaperSizeMm;
  /** Human-readable label, e.g. "A4", "Custom (21x29.7cm)" */
  source: string;
}

/**
 * Scan region dimensions in device units (eSCL: 1/300", non-eSCL: pixels at scan DPI).
 */
export interface ScanRegionUnits {
  width: number;
  height: number;
}

/**
 * Paper size preset mapping to dimensions in millimeters.
 */
const PAPER_SIZE_PRESETS: Record<string, PaperSizeMm> = {
  a4: { widthMm: 210, heightMm: 297 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
  legal: { widthMm: 215.9, heightMm: 355.6 },
  a5: { widthMm: 148, heightMm: 210 },
  a6: { widthMm: 105, heightMm: 148 },
  b5: { widthMm: 176, heightMm: 250 },
  tabloid: { widthMm: 279.4, heightMm: 431.8 },
};

/**
 * Converts millimeters to scan region units using the given unit resolution.
 *
 * @param mm - Dimension in millimeters
 * @param unitResolution - Units per inch (300 for eSCL, scan DPI for non-eSCL)
 */
export function mmToScanUnits(mm: number, unitResolution: number): number {
  return Math.round((mm / 25.4) * unitResolution);
}

/**
 * Converts a paper size preset name to dimensions in millimeters.
 * Returns null for the "Max" pseudo-preset (caller must handle device max).
 */
export function paperSizePresetToMm(preset: string): PaperSizeMm | null {
  const normalized = preset.toLowerCase().trim();
  if (normalized === "max") {
    return null;
  }
  return PAPER_SIZE_PRESETS[normalized] ?? null;
}

/**
 * Parses a custom paper size string in the format "WxH<unit>".
 * Supported units: mm, cm, in.
 * Example: "21x29.7cm", "8.5x11in", "210x297mm"
 */
export function parsePaperSize(input: string): PaperSizeMm | null {
  const match = /^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*(cm|mm|in)$/i.exec(
    input.trim(),
  );

  if (!match) {
    return null;
  }

  const width = parseFloat(match[1]);
  const height = parseFloat(match[2]);
  const unit = match[3].toLowerCase();

  if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
    return null;
  }

  switch (unit) {
    case "cm":
      return { widthMm: width * 10, heightMm: height * 10 };
    case "in":
      return { widthMm: width * 25.4, heightMm: height * 25.4 };
    default:
      return { widthMm: width, heightMm: height };
  }
}

/**
 * Resolves a paper size configuration (preset name or custom dimension string)
 * to millimeters, without any device clamping.
 *
 * - If both paperSizeInput and paperDimInput are provided, throws.
 * - If "Max" preset is provided, returns null (caller owns device-max logic).
 * - If neither is provided, returns null.
 *
 * @param paperSizeInput - Preset name (e.g. "A4", "Letter", "Max")
 * @param paperDimInput  - Custom dimension string (e.g. "21x29.7cm")
 */
export function validateAndResolvePaperSize(
  paperSizeInput?: string | null,
  paperDimInput?: string | null,
): ResolvedPaperSize | null {
  const normalizedSize =
    typeof paperSizeInput === "string"
      ? paperSizeInput.trim() || undefined
      : undefined;
  const normalizedDim =
    typeof paperDimInput === "string"
      ? paperDimInput.trim() || undefined
      : undefined;

  if (normalizedSize !== undefined && normalizedDim !== undefined) {
    throw new Error(
      "Cannot specify both --paper-size and --paper-dim. Choose one.",
    );
  }

  if (normalizedDim !== undefined) {
    const parsed = parsePaperSize(normalizedDim);
    if (!parsed) {
      throw new Error(
        `Invalid paper dimension format: "${normalizedDim}". ` +
          'Use "21x29.7cm", "8.5x11in", or "210x297mm".',
      );
    }
    return { resolvedMm: parsed, source: `Custom (${normalizedDim})` };
  }

  if (normalizedSize !== undefined) {
    if (normalizedSize.toLowerCase() === "max") {
      // Caller is responsible for substituting device max dimensions.
      return null;
    }

    const preset = paperSizePresetToMm(normalizedSize);
    if (!preset) {
      throw new Error(`Unknown paper size preset: "${normalizedSize}".`);
    }
    return { resolvedMm: preset, source: normalizedSize.toUpperCase() };
  }

  return null;
}

/**
 * Converts resolved paper size (in mm) to scan region units, clamped to device
 * maximum dimensions (also expressed in the same unit space).
 *
 * This is the final step before submitting a ScanRegion to the device.
 *
 * @param resolvedMm     - Paper size in millimeters (from validateAndResolvePaperSize)
 * @param unitResolution - Units per inch: use ESCL_UNIT_RESOLUTION (300) for eSCL,
 *                         or the scan DPI for non-eSCL devices
 * @param maxWidth       - Device max width in device units (null = unconstrained)
 * @param maxHeight      - Device max height in device units (null = unconstrained)
 */
export function paperSizeMmToScanRegion(
  resolvedMm: PaperSizeMm,
  unitResolution: number,
  maxWidth: number | null,
  maxHeight: number | null,
): ScanRegionUnits {
  let width = mmToScanUnits(resolvedMm.widthMm, unitResolution);
  let height = mmToScanUnits(resolvedMm.heightMm, unitResolution);

  if (maxWidth !== null) {
    width = Math.min(width, maxWidth);
  }
  if (maxHeight !== null) {
    height = Math.min(height, maxHeight);
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

/**
 * Returns the default paper size (A4).
 */
export function getDefaultPaperSize(): PaperSizeMm {
  return { widthMm: 210, heightMm: 297 };
}

/**
 * Returns true if the given preset string is the "Max" pseudo-preset.
 */
export function isMaxPreset(preset?: string | null): boolean {
  return preset?.toLowerCase().trim() === "max";
}
