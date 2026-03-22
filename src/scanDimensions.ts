import { InputSource } from "./type/InputSource.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import type { ScanConfig } from "./type/scanConfigs.js";
import {
  ESCL_UNIT_RESOLUTION,
  isMaxPreset,
  paperSizeMmToScanRegion,
  validateAndResolvePaperSize,
} from "./PaperSize.js";

/**
 * Returns the unit resolution for scan region dimensions.
 *
 * eSCL: always 1/300 inch (ContentRegionUnits = ThreeHundredthsOfInches, per spec).
 * Non-eSCL: pixels at the configured scan DPI.
 */
export function getUnitResolution(
  isEscl: boolean,
  resolution: number,
): number {
  return isEscl ? ESCL_UNIT_RESOLUTION : resolution;
}

/**
 * Gets the maximum scan dimensions for a given input source and mode,
 * expressed in device units (eSCL: 1/300", non-eSCL: pixels at scan DPI).
 */
export function getMaxScanDimensions(
  inputSource: InputSource,
  isDuplex: boolean,
  deviceCapabilities: DeviceCapabilities,
): { maxWidth: number | null; maxHeight: number | null } {
  if (inputSource === InputSource.Adf) {
    return {
      maxWidth: isDuplex
        ? deviceCapabilities.adfDuplexMaxWidth
        : deviceCapabilities.adfMaxWidth,
      maxHeight: isDuplex
        ? deviceCapabilities.adfDuplexMaxHeight
        : deviceCapabilities.adfMaxHeight,
    };
  }
  return {
    maxWidth: deviceCapabilities.platenMaxWidth,
    maxHeight: deviceCapabilities.platenMaxHeight,
  };
}

/**
 * Resolves a paper size configuration to scan region dimensions in device units.
 *
 * Handles three cases:
 *  1. "Max" preset  → use device capability limits directly
 *  2. Named preset or custom "WxH<unit>" → resolve to mm, clamp, convert
 *  3. No paper size config → returns null (caller falls back to other logic)
 *
 * @param scanConfig   - User scan configuration (paperSize / paperDim)
 * @param maxWidth     - Device max width in device units (null = unconstrained)
 * @param maxHeight    - Device max height in device units (null = unconstrained)
 * @param isEscl       - True if the device uses the eSCL protocol
 */
export function resolvePaperSizeToScanRegion(
  scanConfig: ScanConfig,
  maxWidth: number | null,
  maxHeight: number | null,
  isEscl: boolean,
): { width: number; height: number } | null {
  if (scanConfig.paperSize === undefined && scanConfig.paperDim === undefined) {
    return null;
  }

  const unitResolution = getUnitResolution(isEscl, scanConfig.resolution);

  // "Max" preset: use device capability limits directly — no mm round-trip needed.
  if (isMaxPreset(scanConfig.paperSize)) {
    if (maxWidth === null || maxHeight === null) {
      return null;
    }
    return { width: maxWidth, height: maxHeight };
  }

  // Resolve preset or custom dimension to mm (no clamping here).
  const resolved = validateAndResolvePaperSize(
    scanConfig.paperSize,
    scanConfig.paperDim,
    scanConfig.paperOrientation,
  );
  if (!resolved) {
    return null;
  }

  // Convert to device units and clamp to device limits.
  const region = paperSizeMmToScanRegion(
    resolved.resolvedMm,
    unitResolution,
    maxWidth,
    maxHeight,
  );

  console.log(
    `Paper size resolved: ${resolved.source}` +
      ` → ${region.width}×${region.height} units` +
      ` (unitResolution=${unitResolution}, isEscl=${isEscl})`,
  );

  return { width: region.width, height: region.height };
}

export function resolveDimensions(
  paperRegion: { width: number; height: number } | null,
  maxScanDimensions: { maxWidth: number | null; maxHeight: number | null },
  scanConfig: {
    width: number | "max" | undefined;
    height: number | "max" | undefined;
  },
  unitResolution: number,
): { width: number | null; height: number | null } {
  if (paperRegion !== null) {
    return { width: paperRegion.width, height: paperRegion.height };
  }

  const resolve = (
    maxDim: number | null,
    dimConfig: number | "max" | undefined,
  ) => {
    if (dimConfig !== undefined) {
      if (dimConfig === "max" || dimConfig <= 0) {
        return maxDim;
      }
      const dimInUnits = Math.round(dimConfig * unitResolution);
      if (maxDim !== null && dimInUnits > maxDim) {
        return maxDim;
      }
      return dimInUnits;
    }
    return maxDim;
  };

  return {
    width: resolve(maxScanDimensions.maxWidth, scanConfig.width),
    height: resolve(maxScanDimensions.maxHeight, scanConfig.height),
  };
}

export function getScanDimensions(
  scanConfig: ScanConfig,
  inputSource: InputSource,
  deviceCapabilities: DeviceCapabilities,
  isDuplex: boolean,
): { width: number | null; height: number | null } {
  const caps = getMaxScanDimensions(inputSource, isDuplex, deviceCapabilities);
  const paperRegion = resolvePaperSizeToScanRegion(
    scanConfig,
    caps.maxWidth,
    caps.maxHeight,
    deviceCapabilities.isEscl,
  );
  const unitResolution = getUnitResolution(
    deviceCapabilities.isEscl,
    scanConfig.resolution,
  );

  return resolveDimensions(paperRegion, caps, scanConfig, unitResolution);
}
