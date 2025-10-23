import HPApi from "../HPApi.js";
import { readDeviceCapabilities } from "../readDeviceCapabilities.js";
import { singleScan } from "../scanProcessing.js";
import type { SingleScanConfig } from "../type/scanConfigs.js";
import PathHelper from "../PathHelper.js";

export async function singleScanCmd(
  singleScanConfig: SingleScanConfig,
  deviceUpPollingInterval: number,
) {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp(deviceUpPollingInterval);

  const folder = await PathHelper.getTargetFolder(
    singleScanConfig.directoryConfig.directory,
  );

  const tempFolder = await PathHelper.getTempFolder(
    singleScanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities(
    singleScanConfig.preferEscl,
  );

  try {
    await singleScan(
      0,
      folder,
      tempFolder,
      singleScanConfig,
      deviceCapabilities,
      new Date(),
    );
  } catch (e) {
    console.log(e);
  }
}
