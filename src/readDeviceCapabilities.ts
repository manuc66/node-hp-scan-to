import type DeviceClient from "./DeviceClient.js";
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
    eSclScanCaps = await api.getEsclScanCapsFromWellKnownPath();
    if (eSclScanCaps !== null) {
      logger.info("eSCL capabilities discovered via well-known endpoint.");
    }
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
