import type DeviceClient from "../DeviceClient.js";
import { readDeviceCapabilities } from "../readDeviceCapabilities.js";
import { singleScan } from "../scanProcessing.js";
import type { SingleScanConfig } from "../type/scanConfigs.js";
import PathHelper from "../PathHelper.js";

export async function singleScanCmd(
  api: DeviceClient,
  singleScanConfig: SingleScanConfig,
  deviceUpPollingInterval: number,
) {
  await api.waitDeviceUp(deviceUpPollingInterval);

  const folder = await PathHelper.getTargetFolder(
    singleScanConfig.directoryConfig.directory,
  );

  const tempFolder = await PathHelper.getTempFolder(
    singleScanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities(
    api,
    singleScanConfig.preferEscl,
  );

  await singleScan(
    api,
    0,
    folder,
    tempFolder,
    singleScanConfig,
    deviceCapabilities,
    new Date(),
  );
}
