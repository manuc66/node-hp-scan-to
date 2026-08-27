import type DeviceClient from "./DeviceClient.js";
import type ScanCaps from "./hpModels/ScanCaps.js";
import type DiscoveryTree from "./type/DiscoveryTree.js";
import type EsclScanCaps from "./hpModels/EsclScanCaps.js";
import type { IScanStatus } from "./hpModels/IScanStatus.js";
import type { DeviceCapabilities } from "./type/DeviceCapabilities.js";
import type { InputSource } from "./type/InputSource.js";
import type { IScanJobSettings } from "./hpModels/IScanJobSettings.js";
import EsclScanJobSettings from "./hpModels/EsclScanJobSettings.js";
import ScanJobSettings from "./hpModels/ScanJobSettings.js";
import type { ScanMode } from "./type/scanMode.js";
import type { ImageFormat } from "./imageFormats/index.js";
import type { IScanCaps } from "./IScanCaps.js";
import type { ToneMap } from "./type/scanConfigs.js";

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
  }

  if (preferEscl && eSclScanCaps !== null) {
    return eSclScanCaps;
  }
  if (scanCaps !== null) {
    return scanCaps;
  }

  return eSclScanCaps;
}

export async function readDeviceCapabilities(
  api: DeviceClient,
  preferEscl: boolean,
): Promise<DeviceCapabilities> {
  let supportsMultiItemScanFromPlaten = true;
  let useWalkupScanToComp = false;
  let userActionTimeout: number | null = null;

  const discoveryTree = await api.getDiscoveryTree();

  if (discoveryTree.WalkupScanToCompManifestURI !== null) {
    useWalkupScanToComp = true;
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
    await api.getWalkupScanManifest(discoveryTree.WalkupScanManifestURI);
  } else {
    console.log(
      "WARNING: No compatible device capabilities detected. The device may not support the listen command, and while the application will continue to run, it is likely to encounter a crash. If your device has an automatic document feeder, you may want to try using the adf-autoscan command.",
    );
  }
  const scanCaps = await getScanCaps(api, discoveryTree, preferEscl);

  if (scanCaps === null) {
    console.log(
      "WARNING: No scan capabilities found on the device, the device is likely not well supported",
    );
  }

  if (scanCaps?.isEscl === true) {
    console.log(
      "eSCL detected: ScanRegions use 1/300in units; MaxWidth/MaxHeight are assumed in the same units.",
    );
    console.log(
      `eSCL max (platen): ${scanCaps.platenMaxWidth}x${scanCaps.platenMaxHeight}, ` +
        `ADF: ${scanCaps.adfMaxWidth}x${scanCaps.adfMaxHeight}, ` +
        `ADF duplex: ${scanCaps.adfDuplexMaxWidth}x${scanCaps.adfDuplexMaxHeight}`,
    );
  }

  const getScanStatus = async (): Promise<IScanStatus> => {
    let scanStatus: IScanStatus;
    if (scanCaps?.isEscl === true) {
      scanStatus = await api.getEsclScanStatus();
    } else {
      scanStatus = await api.getScanStatus();
    }
    return scanStatus;
  };

  const createScanJobSettings = (
    inputSource: InputSource,
    contentType: "Document" | "Photo",
    format: ImageFormat,
    resolution: number,
    mode: ScanMode,
    width: number | null,
    height: number | null,
    isDuplex: boolean,
    toneMap?: ToneMap,
  ): IScanJobSettings => {
    let scanJobSettings: IScanJobSettings;
    if (scanCaps?.isEscl === true) {
      scanJobSettings = new EsclScanJobSettings(
        inputSource,
        contentType,
        format,
        resolution,
        mode,
        width,
        height,
        isDuplex,
        toneMap,
        scanCaps as EsclScanCaps,
      );
    } else {
      scanJobSettings = new ScanJobSettings(
        inputSource,
        contentType,
        format,
        resolution,
        mode,
        width,
        height,
        isDuplex,
        scanCaps as ScanCaps,
        toneMap,
      );
    }
    return scanJobSettings;
  };

  const submitScanJob = async (
    scanJobSettings: IScanJobSettings,
  ): Promise<string> => {
    let jobUrl: string;
    if (scanCaps?.isEscl === true) {
      jobUrl = await api.postEsclJob(scanJobSettings);
    } else {
      jobUrl = await api.postJob(scanJobSettings);
    }
    return jobUrl;
  };

  return {
    supportsMultiItemScanFromPlaten,
    useWalkupScanToComp,
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
