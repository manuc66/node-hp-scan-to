import HPApi from "./HPApi.js";
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

async function getScanCaps(
  discoveryTree: DiscoveryTree,
  preferEscl: boolean,
): Promise<ScanCaps | EsclScanCaps | null> {
  let scanCaps: ScanCaps | null = null;
  if (discoveryTree.ScanJobManifestURI !== null) {
    const scanJobManifest = await HPApi.getScanJobManifest(
      discoveryTree.ScanJobManifestURI,
    );
    if (scanJobManifest.ScanCapsURI !== null) {
      scanCaps = await HPApi.getScanCaps(scanJobManifest.ScanCapsURI);
    }
  }

  let eSclScanCaps: EsclScanCaps | null = null;
  if (discoveryTree.EsclManifestURI !== null) {
    const scanJobManifest = await HPApi.getEsclScanJobManifest(
      discoveryTree.EsclManifestURI,
    );
    if (scanJobManifest.scanCapsURI !== null) {
      eSclScanCaps = await HPApi.getEsclScanCaps(scanJobManifest.scanCapsURI);
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
  preferEscl: boolean,
): Promise<DeviceCapabilities> {
  let supportsMultiItemScanFromPlaten = true;
  let useWalkupScanToComp = false;

  const discoveryTree = await HPApi.getDiscoveryTree();

  if (discoveryTree.WalkupScanToCompManifestURI !== null) {
    useWalkupScanToComp = true;
    const walkupScanToCompManifest = await HPApi.getWalkupScanToCompManifest(
      discoveryTree.WalkupScanToCompManifestURI,
    );
    if (walkupScanToCompManifest.WalkupScanToCompCapsURI !== null) {
      const walkupScanToCompCaps = await HPApi.getWalkupScanToCompCaps(
        walkupScanToCompManifest.WalkupScanToCompCapsURI,
      );
      supportsMultiItemScanFromPlaten =
        walkupScanToCompCaps.supportsMultiItemScanFromPlaten;
    }
  } else if (discoveryTree.WalkupScanManifestURI !== null) {
    // No caps to load here but check we can load the specified manifest
    await HPApi.getWalkupScanManifest(discoveryTree.WalkupScanManifestURI);
  } else {
    console.log(
      "WARNING: No compatible device capabilities detected. The device may not support the listen command, and while the application will continue to run, it is likely to encounter a crash. If your device has an automatic document feeder, you may want to try using the adf-autoscan command.",
    );
  }
  const scanCaps = await getScanCaps(discoveryTree, preferEscl);

  if (scanCaps === null) {
    console.log(
      "WARNING: No scan capabilities found on the device, the device is likely not well supported",
    );
  }

  const getScanStatus = async (): Promise<IScanStatus> => {
    let scanStatus: IScanStatus;
    if (scanCaps?.isEscl === true) {
      scanStatus = await HPApi.getEsclScanStatus();
    } else {
      scanStatus = await HPApi.getScanStatus();
    }
    return scanStatus;
  };

  const createScanJobSettings = (
    inputSource: InputSource,
    contentType: "Document" | "Photo",
    resolution: number,
    mode: ScanMode,
    width: number | null,
    height: number | null,
    isDuplex: boolean,
  ): IScanJobSettings => {
    let scanJobSettings: IScanJobSettings;
    if (scanCaps?.isEscl === true) {
      scanJobSettings = new EsclScanJobSettings(
        inputSource,
        contentType,
        resolution,
        mode,
        width,
        height,
        isDuplex,
      );
    } else {
      scanJobSettings = new ScanJobSettings(
        inputSource,
        contentType,
        resolution,
        mode,
        width,
        height,
        isDuplex,
      );
    }
    return scanJobSettings;
  };

  const submitScanJob = async (
    scanJobSettings: IScanJobSettings,
  ): Promise<string> => {
    let jobUrl: string;
    if (scanCaps?.isEscl === true) {
      jobUrl = await HPApi.postEsclJob(scanJobSettings);
    } else {
      jobUrl = await HPApi.postJob(scanJobSettings);
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
    isEscl: scanCaps?.isEscl ?? false,
    getScanStatus,
    createScanJobSettings,
    submitScanJob,
  };
}
