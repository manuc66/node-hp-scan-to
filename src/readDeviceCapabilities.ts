import type DeviceClient from "./DeviceClient.js";
import { AxiosError } from "axios";
import { DeviceNotReadyError } from "./type/DeviceNotReadyError.js";
import { retry } from "./retry.js";
import type ScanCaps from "./hpModels/ScanCaps.js";
import type DiscoveryTree from "./type/DiscoveryTree.js";
import type EsclScanCaps from "./hpModels/EsclScanCaps.js";
import type { IScanStatus } from "./hpModels/IScanStatus.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import EsclScanJobSettings from "./hpModels/EsclScanJobSettings.js";
import ScanJobSettings from "./hpModels/ScanJobSettings.js";
import type { IScanCaps } from "./IScanCaps.js";
import HpWalkupScanListener from "./scanListeners/HpWalkupScanListener.js";
import EsclWalkupScanListener from "./scanListeners/EsclWalkupScanListener.js";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

/**
 * Probe the standard eSCL capability endpoints. A device that is reachable but
 * not ready yet only matters when eSCL is the only scan interface; when the
 * tree advertises another interface, keep it and let the caller fall back.
 */
async function probeWellKnownEsclCaps(
  api: DeviceClient,
  discoveryTree: DiscoveryTree,
): Promise<EsclScanCaps | null> {
  try {
    const caps = await api.getEsclScanCapsFromWellKnownPath();
    if (caps !== null) {
      logger.info("eSCL capabilities discovered via well-known endpoint.");
    }
    return caps;
  } catch (error) {
    if (
      error instanceof DeviceNotReadyError &&
      discoveryTree.hasScanInterface
    ) {
      logger.debug(
        `eSCL capabilities are not ready; keeping the advertised scan interface (${error.message})`,
      );
      return null;
    }
    throw error;
  }
}

async function getScanCaps(
  api: DeviceClient,
  discoveryTree: DiscoveryTree,
  preferEscl: boolean,
): Promise<IScanCaps | null> {
  let scanCaps: ScanCaps | null = null;
  if (discoveryTree.ScanJobManifestURI !== null) {
    const scanJobManifest = await api.getScanJobManifest(
      discoveryTree.ScanJobManifestURI,
    );
    if (scanJobManifest.ScanCapsURI !== null) {
      scanCaps = await api.getScanCaps(scanJobManifest.ScanCapsURI);
    }
  }

  let eSclScanCaps: EsclScanCaps | null = null;
  if (discoveryTree.EsclManifestURI !== null) {
    const scanJobManifest = await api.getEsclScanJobManifest(
      discoveryTree.EsclManifestURI,
    );
    if (scanJobManifest.scanCapsURI !== null) {
      eSclScanCaps = await api.getEsclScanCaps(scanJobManifest.scanCapsURI);
    }
  } else if (preferEscl || !discoveryTree.hasScanInterface) {
    // No eSCL manifest advertised (or no scan interface at all): probe the
    // standard eSCL capabilities endpoints directly. This also covers
    // devices that no longer serve DiscoveryTree.xml, without requiring an
    // explicit --prefer-eSCL.
    logger.info(
      preferEscl
        ? "Probing the well-known eSCL capabilities endpoints because eSCL is preferred."
        : "The device advertises no scan interface; probing the well-known eSCL capabilities endpoints.",
    );
    eSclScanCaps = await probeWellKnownEsclCaps(api, discoveryTree);
  }

  if (preferEscl && eSclScanCaps !== null) {
    return eSclScanCaps;
  }
  if (scanCaps !== null) {
    return scanCaps;
  }

  return eSclScanCaps;
}

async function resolveWalkupScanListener(
  api: DeviceClient,
  scanCaps: IScanCaps | null,
  detectWalkup: boolean,
  hpScanToComp: boolean | null,
  userActionTimeout: number | null,
): Promise<DeviceCapabilities["createWalkupScanListener"]> {
  if (!detectWalkup) {
    return null;
  }

  if (hpScanToComp !== null) {
    const isScanToComp = hpScanToComp;
    logger.info(
      `Using ${isScanToComp ? "WalkupScanToComp" : "WalkupScan"} walkup listener.`,
    );
    return (listenerApi, registrationConfigs) =>
      new HpWalkupScanListener(
        listenerApi,
        registrationConfigs,
        isScanToComp,
        userActionTimeout,
      );
  }

  // Walkup is orthogonal to the scan protocol: an eSCL device can expose the
  // subscription extension whether or not its DiscoveryTree advertises eSCL.
  // HP walkup manifests were already handled above, so probe the standard
  // endpoint whenever the device scans over eSCL.
  if (
    scanCaps?.isEscl === true &&
    (await api.supportsEsclWalkup())
  ) {
    logger.info("Using eSCL walkup listener.");
    return (listenerApi, registrationConfigs) =>
      new EsclWalkupScanListener(listenerApi, registrationConfigs);
  }

  if (scanCaps?.isEscl === true) {
    logger.info(
      "The device supports eSCL scanning but not eSCL walkup; the listen command is not available for it.",
    );
    return null;
  }

  logger.warn(
    "No compatible device capabilities detected. It appears that your device may not support the listen command. While the application will still run, there is a possibility it may crash. If your device includes an automatic document feeder, consider using the adf-autoscan command instead.",
  );
  return (listenerApi, registrationConfigs) =>
    new HpWalkupScanListener(
      listenerApi,
      registrationConfigs,
      false,
      userActionTimeout,
    );
}

function buildScanStatusReader(
  api: DeviceClient,
  scanCaps: IScanCaps | null,
): () => Promise<IScanStatus> {
  return scanCaps?.isEscl === true
    ? async () => await api.getEsclScanStatus()
    : async () => await api.getScanStatus();
}

function buildScanJobSettingsFactory(
  scanCaps: IScanCaps | null,
): DeviceCapabilities["createScanJobSettings"] {
  return (
    inputSource,
    contentType,
    format,
    resolution,
    mode,
    width,
    height,
    isDuplex,
    contextID,
  ) =>
    scanCaps?.isEscl === true
      ? new EsclScanJobSettings(
          inputSource,
          contentType,
          format,
          resolution,
          mode,
          width,
          height,
          isDuplex,
          contextID,
        )
      : new ScanJobSettings(
          inputSource,
          contentType,
          format,
          resolution,
          mode,
          width,
          height,
          isDuplex,
          scanCaps as ScanCaps,
        );
}

function buildScanJobSubmitter(
  api: DeviceClient,
  scanCaps: IScanCaps | null,
): DeviceCapabilities["submitScanJob"] {
  return scanCaps?.isEscl === true
    ? async (scanJobSettings) => await api.postEsclJob(scanJobSettings)
    : async (scanJobSettings) => await api.postJob(scanJobSettings);
}

export async function readDeviceCapabilities(
  api: DeviceClient,
  preferEscl: boolean,
  detectWalkup = false,
): Promise<DeviceCapabilities> {
  let supportsMultiItemScanFromPlaten = true;
  let hpScanToComp: boolean | null = null;
  let userActionTimeout: number | null = null;

  const discoveryTree = await api.getDiscoveryTree();

  if (discoveryTree.WalkupScanToCompManifestURI !== null) {
    hpScanToComp = true;
    const walkupScanToCompManifest = await api.getWalkupScanToCompManifest(
      discoveryTree.WalkupScanToCompManifestURI,
    );
    if (walkupScanToCompManifest.WalkupScanToCompCapsURI !== null) {
      const walkupScanToCompCaps = await api.getWalkupScanToCompCaps(
        walkupScanToCompManifest.WalkupScanToCompCapsURI,
      );
      supportsMultiItemScanFromPlaten =
        walkupScanToCompCaps.supportsMultiItemScanFromPlaten;
      userActionTimeout = walkupScanToCompCaps.userActionTimeout;
    }
  } else if (discoveryTree.WalkupScanManifestURI !== null) {
    hpScanToComp = false;
    await api.getWalkupScanManifest(discoveryTree.WalkupScanManifestURI);
  }
  const scanCaps = await getScanCaps(api, discoveryTree, preferEscl);

  const createWalkupScanListener = await resolveWalkupScanListener(
    api,
    scanCaps,
    detectWalkup,
    hpScanToComp,
    userActionTimeout,
  );

  if (scanCaps === null) {
    logger.warn(
      "No scan capabilities detected on the device. It seems that the device may not be adequately supported or may not support scanning at all.",
    );
  }

  if (scanCaps?.isEscl === true) {
    logger.info(
      "eSCL detected: ScanRegions use 1/300in units; MaxWidth/MaxHeight are assumed in the same units.",
    );
    logger.info(
      `eSCL max (platen): ${scanCaps.platenMaxWidth}x${scanCaps.platenMaxHeight}, ` +
        `ADF: ${scanCaps.adfMaxWidth}x${scanCaps.adfMaxHeight}, ` +
        `ADF duplex: ${scanCaps.adfDuplexMaxWidth}x${scanCaps.adfDuplexMaxHeight}`,
    );
  }

  const getScanStatus = buildScanStatusReader(api, scanCaps);
  const createScanJobSettings = buildScanJobSettingsFactory(scanCaps);
  const submitScanJob = buildScanJobSubmitter(api, scanCaps);

  return {
    supportsMultiItemScanFromPlaten,
    createWalkupScanListener,
    platenMaxWidth: scanCaps?.platenMaxWidth ?? null,
    platenMaxHeight: scanCaps?.platenMaxHeight ?? null,
    adfMaxWidth: scanCaps?.adfMaxWidth ?? null,
    adfMaxHeight: scanCaps?.adfMaxHeight ?? null,
    adfDuplexMaxWidth: scanCaps?.adfDuplexMaxWidth ?? null,
    adfDuplexMaxHeight: scanCaps?.adfDuplexMaxHeight ?? null,
    hasAdfDuplex: scanCaps?.hasAdfDuplex ?? false,
    hasAdfDetectPaperLoaded: scanCaps?.hasAdfDetectPaperLoaded ?? false,
    userActionTimeout,
    isEscl: scanCaps?.isEscl ?? false,
    getScanStatus,
    createScanJobSettings,
    submitScanJob,
  };
}

const CAPABILITY_RETRY_TIMEOUT_MS = 60_000;
const CAPABILITY_RETRY_DELAY_MS = 2_000;

export interface CapabilityRetryOptions {
  /** How long to keep retrying before surfacing the last error. */
  timeoutMs?: number;
  /** Delay between two detection attempts. */
  retryDelayMs?: number;
}

/**
 * Errors that mean "the device is reachable but its services are not up yet".
 * 404/405 are handled by the probe itself and never end up here, so a 403 is
 * the boot signature reported in #1831 rather than an access-control failure
 * we could fix by waiting; a genuine permission error still fails after the
 * bounded retry window.
 */
function isNotReadyError(error: unknown): boolean {
  if (error instanceof DeviceNotReadyError) {
    return true;
  }
  if (!(error instanceof AxiosError)) {
    return false;
  }
  const status = error.response?.status ?? error.status;
  if (status === undefined) {
    return true;
  }
  return (
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

/**
 * Detect capabilities, retrying while the printer answers on the network but
 * its HTTP/eSCL services are still booting. `listen` starts as soon as the
 * container is up, which is typically before the printer is ready.
 */
export async function readDeviceCapabilitiesWithRetry(
  api: DeviceClient,
  preferEscl: boolean,
  detectWalkup = false,
  options: CapabilityRetryOptions = {},
): Promise<DeviceCapabilities> {
  return await retry(
    () => readDeviceCapabilities(api, preferEscl, detectWalkup),
    {
      timeoutMs: options.timeoutMs ?? CAPABILITY_RETRY_TIMEOUT_MS,
      delayMs: options.retryDelayMs ?? CAPABILITY_RETRY_DELAY_MS,
      shouldRetry: isNotReadyError,
      onRetry: (_error, attempt) => {
        if (attempt === 1) {
          logger.warn(
            "The printer is reachable but its services are not ready yet; retrying capability detection.",
          );
        }
      },
      sleep: (ms) => api.delay(ms),
    },
  );
}
