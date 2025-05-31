import { DeviceCapabilities } from "./type/DeviceCapabilities";
import HPApi from "./HPApi";
import ScanCaps from "./hpModels/ScanCaps";
import DiscoveryTree from "./type/DiscoveryTree";

async function getScanCaps(
  discoveryTree: DiscoveryTree,
): Promise<ScanCaps | null> {
  let scanCaps: ScanCaps | null = null;
  if (discoveryTree.ScanJobManifestURI != null) {
    const scanJobManifest = await HPApi.getScanJobManifest(
      discoveryTree.ScanJobManifestURI,
    );
    if (scanJobManifest.ScanCapsURI != null) {
      scanCaps = await HPApi.getScanCaps(scanJobManifest.ScanCapsURI);
    }
  }
  return scanCaps;
}

export async function readDeviceCapabilities(): Promise<DeviceCapabilities> {
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
  const scanCaps = await getScanCaps(discoveryTree);

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
  };
}
