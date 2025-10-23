import HPApi from "../HPApi.js";
import { readDeviceCapabilities } from "../readDeviceCapabilities.js";
import { scanFromAdf, waitAdfLoaded } from "../scanProcessing.js";
import { delay } from "../delay.js";
import type { AdfAutoScanConfig } from "../type/scanConfigs.js";
import PathHelper from "../PathHelper.js";

let iteration = 0;
export async function adfAutoscanCmd(
  adfAutoScanConfig: AdfAutoScanConfig,
  deviceUpPollingInterval: number,
): Promise<void> {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp(deviceUpPollingInterval);
  let deviceUp = true;

  const folder = await PathHelper.getTargetFolder(
    adfAutoScanConfig.directoryConfig.directory,
  );
  const tempFolder = await PathHelper.getTempFolder(
    adfAutoScanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities(
    adfAutoScanConfig.preferEscl,
  );

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
        deviceCapabilities.getScanStatus,
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
