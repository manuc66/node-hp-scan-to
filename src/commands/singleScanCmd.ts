import { SingleScanConfig } from "scanConfigs";
import HPApi from "../HPApi";
import { getTargetFolder, getTempFolder } from "../scanConfigUtils";
import { readDeviceCapabilities } from "../readDeviceCapabilities";
import { singleScan } from "../scanProcessing";

export async function singleScanCmd(
  singleScanConfig: SingleScanConfig,
  deviceUpPollingInterval: number,
) {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp(deviceUpPollingInterval);

  const folder = await getTargetFolder(
    singleScanConfig.directoryConfig.directory,
  );

  const tempFolder = await getTempFolder(
    singleScanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities();

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