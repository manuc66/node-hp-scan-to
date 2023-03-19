import { DeviceCapabilities } from "./DeviceCapabilities";
import HPApi from "./HPApi";
import WalkupScanToCompCaps from "./WalkupScanToCompCaps";

export async function readDeviceCapabilities(): Promise<DeviceCapabilities> {
  let supportsMultiItemScanFromPlaten = true;
  const discoveryTree = await HPApi.getDiscoveryTree();
  let walkupScanToCompCaps: WalkupScanToCompCaps | null = null;
  if (discoveryTree.WalkupScanToCompManifestURI != null) {
    const walkupScanToCompManifest = await HPApi.getWalkupScanToCompManifest(
      discoveryTree.WalkupScanToCompManifestURI
    );
    if (walkupScanToCompManifest.WalkupScanToCompCapsURI != null) {
      walkupScanToCompCaps = await HPApi.getWalkupScanToCompCaps(
        walkupScanToCompManifest.WalkupScanToCompCapsURI
      );
      supportsMultiItemScanFromPlaten =
        walkupScanToCompCaps.supportsMultiItemScanFromPlaten;
    }
  } else if (discoveryTree.WalkupScanManifestURI != null) {
    const walkupScanManifest = await HPApi.getWalkupScanManifest(
      discoveryTree.WalkupScanManifestURI
    );
    if (walkupScanManifest.walkupScanDestinationsURI != null) {
      await HPApi.getWalkupScanDestinations(
        walkupScanManifest.walkupScanDestinationsURI
      );
    }
  } else {
    console.log("Unknown device!");
  }

  if (discoveryTree.ScanJobManifestURI != null) {
    const scanJobManifest = await HPApi.getScanJobManifest(
      discoveryTree.ScanJobManifestURI
    );
    if (scanJobManifest.ScanCapsURI != null) {
      await HPApi.getScanCaps(scanJobManifest.ScanCapsURI);
    }
  }

  return {
    supportsMultiItemScanFromPlaten,
    useWalkupScanToComp: walkupScanToCompCaps != null,
  };
}
