/**
 * Paper size configuration and conversion utilities.
 * Handles preset paper sizes (A4, Letter, etc.) and custom dimensions.
 * Converts between millimeters, centimeters, inches, and pixels.
 */

export enum PaperSizePreset {
  A4 = "A4",
  Letter = "Letter",
  Legal = "Legal",
  A5 = "A5",
  B5 = "B5",
  Max = "Max",
}

/**
 * Paper size in millimeters.
 */
export interface PaperSizeMm {
  widthMm: number;
  heightMm: number;
}

/**
 * Parsed paper size information.
 */
export interface ResolvedPaperSize {
  resolvedMm: PaperSizeMm;
  source: string;
}

/**
 * Pixel dimensions (used for scan job submission).
 */
export interface ScanRegionPixels {
  widthPx: number;
  heightPx: number;
}

/**
 * Paper size preset mapping to dimensions in millimeters.
 * Dimensions are standard ISO/US paper sizes.
 */
const PAPER_SIZE_PRESETS: Record<string, PaperSizeMm> = {
  a4: { widthMm: 210, heightMm: 297 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
  legal: { widthMm: 215.9, heightMm: 355.6 },
  a5: { widthMm: 148, heightMm: 210 },
  b5: { widthMm: 176, heightMm: 250 },
};

/**
 * Clamps the requested paper size to the device maximum dimensions (in mm).
 *
 * If max dimensions are undefined or null, the original values are returned.
 */
function clampPaperSizeToDeviceMax(
  widthMm: number,
  heightMm: number,
  maxWidthMm?: number | null,
  maxHeightMm?: number | null,
): PaperSizeMm {
  let clampedWidth = widthMm;
  let clampedHeight = heightMm;

  if (maxWidthMm !== null && maxWidthMm !== undefined) {
    clampedWidth = Math.min(widthMm, maxWidthMm);
  }

  if (maxHeightMm !== null && maxHeightMm !== undefined) {
    clampedHeight = Math.min(heightMm, maxHeightMm);
  }

  return { widthMm: clampedWidth, heightMm: clampedHeight };
}


/**
 * Converts a paper size preset name to dimensions in millimeters.
 * @param preset - Paper size preset name (case-insensitive)
 * @returns Paper size in millimeters, or null if preset is unknown
 */
export function paperSizePresetToMm(preset: string): PaperSizeMm | null {
  const normalized = preset.toLowerCase().trim();
  if (normalized === "max") {
    return null; // Max is handled separately
  }
  return PAPER_SIZE_PRESETS[normalized] ?? null;
}

/**
 * Parses a custom paper size string in the format "WxHunit".
 * @param input - String like "21x29.7cm", "8.5x11in", "210x297mm"
 * @returns Paper size in millimeters, or null if parsing fails
 */
export function parsePaperSize(input: string): PaperSizeMm | null {
  const trimmed = input.trim();
  // Match pattern: number x number + unit
  const match = /^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*(cm|mm|in)$/i.exec(
    trimmed,
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

  let widthMm = width;
  let heightMm = height;

  switch (unit) {
    case "cm":
      widthMm = width * 10;
      heightMm = height * 10;
      break;
    case "in":
      widthMm = width * 25.4;
      heightMm = height * 25.4;
      break;
    case "mm":
      // Already in mm
      break;
  }

  return { widthMm, heightMm };
}

/**
 * Converts paper size dimensions from millimeters to pixels.
 * @param widthMm - Width in millimeters
 * @param heightMm - Height in millimeters
 * @param dpiX - Horizontal resolution in DPI
 * @param dpiY - Vertical resolution in DPI
 * @returns Dimensions in pixels
 */
export function mmToPixels(
  widthMm: number,
  heightMm: number,
  dpiX: number,
  dpiY: number,
): ScanRegionPixels {
  // Formula: pixels = (mm * dpi) / 25.4
  const widthPx = Math.round((widthMm * dpiX) / 25.4);
  const heightPx = Math.round((heightMm * dpiY) / 25.4);

  return {
    widthPx: Math.max(1, widthPx),
    heightPx: Math.max(1, heightPx),
  };
}

/**
 * Validates and resolves paper size configuration.
 * Converts user input (preset or custom) to millimeters.
 *
 * Validation rules:
 * - Only one of paperSize or paperDim should be provided
 * - If Max is specified, device max dimensions will be used later
 * - Custom dimensions are validated against device max
 *
 * @param paperSizeInput - Paper size preset (e.g., "A4", "Letter") or "Max"
 * @param paperDimInput - Custom dimensions (e.g., "21x29.7cm")
 * @param maxWidthMm - Device maximum width in mm (optional, used for validation)
 * @param maxHeightMm - Device maximum height in mm (optional, used for validation)
 * @returns Resolved paper size and source, or null if resolution fails
 * @throws Error if both paperSize and paperDim are provided
 */
export function validateAndResolvePaperSize(
  paperSizeInput?: string | null,
  paperDimInput?: string | null,
  maxWidthMm?: number | null,
  maxHeightMm?: number | null,
): ResolvedPaperSize | null {
  let normalizedPaperSize =
    typeof paperSizeInput === "string" ? paperSizeInput.trim() : undefined;
  let normalizedPaperDim =
    typeof paperDimInput === "string" ? paperDimInput.trim() : undefined;

  if (normalizedPaperSize === "") {
    normalizedPaperSize = undefined;
  }
  if (normalizedPaperDim === "") {
    normalizedPaperDim = undefined;
  }

  // Error if both are provided
  if (normalizedPaperSize !== undefined && normalizedPaperDim !== undefined) {
    throw new Error(
      "Cannot specify both --paper-size and --paper-dim. Choose one or the other.",
    );
  }

  // Try custom dimension first (highest priority)
  if (normalizedPaperDim !== undefined) {
    const parsed = parsePaperSize(normalizedPaperDim);
    if (!parsed) {
      throw new Error(
        `Invalid paper dimension format: "${normalizedPaperDim}". ` +
          'Use format like "21x29.7cm", "8.5x11in", or "210x297mm".',
      );
    }

    const widthMm = parsed.widthMm;
    const heightMm = parsed.heightMm;

    const clamped = clampPaperSizeToDeviceMax(
      widthMm,
      heightMm,
      maxWidthMm,
      maxHeightMm,
    );

    return {
      resolvedMm: { widthMm: clamped.widthMm, heightMm: clamped.heightMm },
      source: `Custom (${normalizedPaperDim})`,
    };
  }

  // Try preset size
  if (normalizedPaperSize !== undefined) {
    const normalized = normalizedPaperSize.toLowerCase().trim();

    // Special case: Max uses device capabilities (handled elsewhere)
    if (normalized === "max") {
      if (
        maxWidthMm === null ||
        maxWidthMm === undefined ||
        maxHeightMm === null ||
        maxHeightMm === undefined
      ) {
        return null;
      }
      return {
        resolvedMm: { widthMm: maxWidthMm, heightMm: maxHeightMm },
        source: "Max (device capabilities)",
      };
    }

    const preset = paperSizePresetToMm(normalizedPaperSize);
    if (!preset) {
      throw new Error(
        `Unknown paper size preset: "${normalizedPaperSize}". ` +
          "Supported presets: A4, Letter, Legal, A5, B5, Max.",
      );
    }

    const widthMm = preset.widthMm;
    const heightMm = preset.heightMm;

    const clamped = clampPaperSizeToDeviceMax(
      widthMm,
      heightMm,
      maxWidthMm,
      maxHeightMm,
    );

    return {
      resolvedMm: { widthMm: clamped.widthMm, heightMm: clamped.heightMm },
      source: normalized.toUpperCase(),
    };
  }

  // No paper size specified
  return null;
}

/**
 * Gets the default paper size (A4).
 * @returns Paper size in millimeters
 */
export function getDefaultPaperSize(): PaperSizeMm {
  return { widthMm: 210, heightMm: 297 }; // A4
}

/**
 * Checks if a preset is the "Max" special case.
 * @param preset - Paper size preset name
 * @returns True if preset is "Max"
 */
export function isMaxPreset(preset?: string | null): boolean {
  return preset?.toLowerCase().trim() === "max";
}
