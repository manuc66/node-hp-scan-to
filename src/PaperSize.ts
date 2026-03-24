/**
 * Standard unit resolution (1/300 inch) used for eSCL ScanRegion (ThreeHundredthsOfInches)
 * and potentially for non-eSCL legacy device configurations.
 */
export const THREE_HUNDREDTHS_OF_INCH_DPI = 300;

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
  // ISO A-series
  a3: { widthMm: 297, heightMm: 420 },
  a4: { widthMm: 210, heightMm: 297 },
  a5: { widthMm: 148, heightMm: 210 },
  a6: { widthMm: 105, heightMm: 148 },
  a7: { widthMm: 74, heightMm: 105 },
  a8: { widthMm: 52, heightMm: 74 },

  // ISO B-series (JIS)
  b4: { widthMm: 250, heightMm: 353 },
  b5: { widthMm: 176, heightMm: 250 },
  b6: { widthMm: 125, heightMm: 176 },

  // North American
  letter: { widthMm: 215.9, heightMm: 279.4 },
  legal: { widthMm: 215.9, heightMm: 355.6 },
  executive: { widthMm: 184.2, heightMm: 266.7 },
  statement: { widthMm: 139.7, heightMm: 215.9 },
  tabloid: { widthMm: 279.4, heightMm: 431.8 },
  ledger: { widthMm: 431.8, heightMm: 279.4 }, // tabloid landscape
  oficio: { widthMm: 215.9, heightMm: 330.2 }, // Latin America
  folio: { widthMm: 215.9, heightMm: 330.2 },

  // Photo
  "4x6": { widthMm: 101.6, heightMm: 152.4 },
  "5x7": { widthMm: 127, heightMm: 177.8 },
  "8x10": { widthMm: 203.2, heightMm: 254 },
  "10x15": { widthMm: 100, heightMm: 150 },

  // Autres
  "business-card": { widthMm: 85.6, heightMm: 53.98 },
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
 * @param orientation    - Orientation ("portrait" or "landscape")
 */
export function validateAndResolvePaperSize(
  paperSizeInput?: string | null,
  paperDimInput?: string | null,
  orientation?: "portrait" | "landscape" | null,
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

    let resolvedMm = { ...preset };
    if (
      orientation === "landscape" &&
      resolvedMm.widthMm < resolvedMm.heightMm
    ) {
      resolvedMm = {
        widthMm: resolvedMm.heightMm,
        heightMm: resolvedMm.widthMm,
      };
    } else if (
      orientation === "portrait" &&
      resolvedMm.widthMm > resolvedMm.heightMm
    ) {
      resolvedMm = {
        widthMm: resolvedMm.heightMm,
        heightMm: resolvedMm.widthMm,
      };
    }

    return { resolvedMm, source: normalizedSize.toUpperCase() };
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
 * @param unitResolution - Units per inch: use THREE_HUNDREDTHS_OF_INCH_DPI (300) for eSCL,
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
