/**
 * Protocol used by a device to notify this host that the user started a scan
 * from the printer panel.
 *
 * The HP-proprietary LEDM variants are kept for older devices; the eSCL
 * variant is the standard walkup-subscription flow used by newer firmware
 * that no longer serves /DevMgmt/DiscoveryTree.xml.
 */
export enum WalkupProtocol {
  WalkupScanToComp = "WalkupScanToComp",
  WalkupScan = "WalkupScan",
  EsclWalkup = "EsclWalkup",
}
