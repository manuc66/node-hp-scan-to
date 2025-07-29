import HPApi from "./HPApi";
import ScanCaps from "./hpModels/ScanCaps";
import DiscoveryTree from "./type/DiscoveryTree";
import EsclScanCaps from "./hpModels/EsclScanCaps";
import { IScanStatus } from "./hpModels/IScanStatus";
import { DeviceCapabilities } from "./type/DeviceCapabilities";

async function getScanCaps(
  discoveryTree: DiscoveryTree,
  preferEscl: boolean
): Promise<ScanCaps | EsclScanCaps | null> {
  let scanCaps: ScanCaps | null = null;
  if (discoveryTree.ScanJobManifestURI != null) {
    const scanJobManifest = await HPApi.getScanJobManifest(
      discoveryTree.ScanJobManifestURI,
    );
    if (scanJobManifest.ScanCapsURI != null) {
      scanCaps = await HPApi.getScanCaps(scanJobManifest.ScanCapsURI);
    }
  }


  let eSclScanCaps: EsclScanCaps | null = null;
  if (discoveryTree.EsclManifest != null) {
    const scanJobManifest = await HPApi.getEsclScanJobManifest(
      discoveryTree.EsclManifest,
    );
    if (scanJobManifest.ScanCapsURI != null) {
      eSclScanCaps = await HPApi.getEsclScanCaps(scanJobManifest.ScanCapsURI);
    }
  }

  if (preferEscl && eSclScanCaps != null) {
    return eSclScanCaps;
  }
  if (scanCaps != null) {
    return scanCaps;
  }

  return eSclScanCaps;
}

export async function readDeviceCapabilities(preferEscl: boolean): Promise<DeviceCapabilities> {
  let supportsMultiItemScanFromPlaten = true;
  let useWalkupScanToComp = false;

  const discoveryTree = await HPApi.getDiscoveryTree();

  if (discoveryTree.WalkupScanToCompManifestURI != null) {
    useWalkupScanToComp = true;
    const walkupScanToCompManifest = await HPApi.getWalkupScanToCompManifest(
      discoveryTree.WalkupScanToCompManifestURI,
    );
    if (walkupScanToCompManifest.WalkupScanToCompCapsURI != null) {
      const walkupScanToCompCaps = await HPApi.getWalkupScanToCompCaps(
        walkupScanToCompManifest.WalkupScanToCompCapsURI,
      );
      supportsMultiItemScanFromPlaten =
        walkupScanToCompCaps.supportsMultiItemScanFromPlaten;
    }
  } else if (discoveryTree.WalkupScanManifestURI != null) {
    // No caps to load here but check we can load the specified manifest
    await HPApi.getWalkupScanManifest(discoveryTree.WalkupScanManifestURI);
  } else {
    console.log(
      "WARNING: No compatible device capabilities detected. The device may not support the listen command, and while the application will continue to run, it is likely to encounter a crash. If your device has an automatic document feeder, you may want to try using the adf-autoscan command.",
    );
  }
  const scanCaps = await getScanCaps(discoveryTree, preferEscl);

  if (scanCaps == null) {
    console.log(
      "WARNING: No scan capabilities found on the device, the device is likely not well supported",
    );
  }

  return {
    supportsMultiItemScanFromPlaten,
    useWalkupScanToComp,
    platenMaxWidth: scanCaps?.platenMaxWidth || null,
    platenMaxHeight: scanCaps?.platenMaxHeight || null,
    adfMaxWidth: scanCaps?.adfMaxWidth || null,
    adfMaxHeight: scanCaps?.adfMaxHeight || null,
    adfDuplexMaxWidth: scanCaps?.adfDuplexMaxWidth || null,
    adfDuplexMaxHeight: scanCaps?.adfDuplexMaxHeight || null,
    hasAdfDuplex: scanCaps?.hasAdfDuplex || false,
    hasAdfDetectPaperLoaded: scanCaps?.hasAdfDetectPaperLoaded || false,
    isEscl: scanCaps?.isEscl || false,
    getScanStatus: async () : Promise<IScanStatus> => {
      let scanStatus : IScanStatus;
      if (scanCaps?.isEscl) {
        scanStatus = await HPApi.getEsclScanStatus();
      }
      else {
        scanStatus = await HPApi.getScanStatus();
      }
      return scanStatus;
    }
  };
}
