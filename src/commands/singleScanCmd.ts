import HPApi from "../HPApi";
import { readDeviceCapabilities } from "../readDeviceCapabilities";
import { singleScan } from "../scanProcessing";
import { SingleScanConfig } from "../type/scanConfigs";
import PathHelper from "../PathHelper";

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
