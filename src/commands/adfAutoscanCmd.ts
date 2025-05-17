import HPApi from "../HPApi";
import { getTargetFolder, getTempFolder } from "../scanConfigUtils";
import { readDeviceCapabilities } from "../readDeviceCapabilities";
import { scanFromAdf, waitAdfLoaded } from "../scanProcessing";
import { delay } from "../delay";
import { AdfAutoScanConfig } from "../type/scanConfigs";

let iteration = 0;
export async function adfAutoscanCmd(
  adfAutoScanConfig: AdfAutoScanConfig,
  deviceUpPollingInterval: number,
): Promise<void> {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp(deviceUpPollingInterval);
  let deviceUp = true;

  const folder = await getTargetFolder(
    adfAutoScanConfig.directoryConfig.directory,
  );
  const tempFolder = await getTempFolder(
    adfAutoScanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities();

  if (!deviceCapabilities.hasAdfDetectPaperLoaded) {
    console.log(
      "WARNING: The automatic scan feature is likely unsupported on this device, as its advertised capabilities do not include this feature.",
    );
  }

  if (adfAutoScanConfig.isDuplex && !deviceCapabilities.hasAdfDuplex) {
    console.log(
      "WARNING: The requested duplex scan method is likely unsupported on this device, as its advertised capabilities do not include this feature.",
    );
  }

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  while (keepActive) {
    iteration++;
    console.log(`Running iteration: ${iteration} - errorCount: ${errorCount}`);
    try {
      await waitAdfLoaded(
        adfAutoScanConfig.pollingInterval,
        adfAutoScanConfig.startScanDelay,
      );

      scanCount++;

      console.log(`Scan event captured, saving scan #${scanCount}`);

      await scanFromAdf(
        scanCount,
        folder,
        tempFolder,
        adfAutoScanConfig,
        deviceCapabilities,
        new Date(),
      );
    } catch (e) {
      console.log(e);
      if (await HPApi.isAlive()) {
        errorCount++;
      } else {
        deviceUp = false;
      }
    }

    if (errorCount === 50) {
      keepActive = false;
    }

    if (!deviceUp) {
      await HPApi.waitDeviceUp(deviceUpPollingInterval);
    } else {
      await delay(1000);
    }
  }
}
