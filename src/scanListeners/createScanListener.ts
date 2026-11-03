import type DeviceClient from "../DeviceClient.js";
import type { DeviceCapabilities } from "../type/DeviceCapabilities.js";
import type { RegistrationConfig } from "../type/scanTargetDefinitions.js";
import { WalkupProtocol } from "../type/WalkupProtocol.js";
import EsclWalkupScanListener from "./EsclWalkupScanListener.js";
import LegacyScanListener from "./LegacyScanListener.js";
import type { ScanListener } from "./ScanListener.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

/**
 * Select the walkup implementation once, from the capabilities negotiated at
 * startup. The rest of the code only talks to the ScanListener interface.
 */
export function createScanListener(
  api: DeviceClient,
  deviceCapabilities: DeviceCapabilities,
  registrationConfigs: RegistrationConfig[],
): ScanListener {
  switch (deviceCapabilities.walkupProtocol) {
    case WalkupProtocol.WalkupScanToComp:
      return new LegacyScanListener(
        api,
        registrationConfigs,
        true,
        deviceCapabilities.userActionTimeout,
      );
    case WalkupProtocol.WalkupScan:
      return new LegacyScanListener(
        api,
        registrationConfigs,
        false,
        deviceCapabilities.userActionTimeout,
      );
    case WalkupProtocol.EsclWalkup:
      return new EsclWalkupScanListener(api, registrationConfigs);
    default:
      if (deviceCapabilities.isEscl) {
        throw new Error(
          "This device supports eSCL scanning but not scan-to-computer (walkup). Use single-scan or adf-autoscan instead.",
        );
      }
      logger.warn(
        "No compatible device capabilities detected. It appears that your device may not support the listen command. While the application will still run, there is a possibility it may crash. If your device includes an automatic document feeder, consider using the adf-autoscan command instead.",
      );
      return new LegacyScanListener(
        api,
        registrationConfigs,
        false,
        deviceCapabilities.userActionTimeout,
      );
  }
}
