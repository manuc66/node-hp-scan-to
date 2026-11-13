import type DeviceClient from "../DeviceClient.js";
import type { DeviceCapabilities } from "../type/DeviceCapabilities.js";
import type { RegistrationConfig } from "../type/scanTargetDefinitions.js";
import type { ScanListener } from "./ScanListener.js";

/**
 * Instantiate the walkup implementation chosen while reading the device
 * capabilities. The rest of the code only talks to the ScanListener interface.
 */
export function createScanListener(
  api: DeviceClient,
  deviceCapabilities: DeviceCapabilities,
  registrationConfigs: RegistrationConfig[],
): ScanListener {
  const factory = deviceCapabilities.createWalkupScanListener;
  if (factory === null) {
    throw new Error(
      "This device supports eSCL scanning but not scan-to-computer (walkup). Use single-scan or adf-autoscan instead.",
    );
  }
  return factory(api, registrationConfigs);
}
