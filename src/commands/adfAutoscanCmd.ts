import HPApi from "../HPApi";
import { readDeviceCapabilities } from "../readDeviceCapabilities";
import { scanFromAdf, waitAdfLoaded } from "../scanProcessing";
import { delay } from "../delay";
import { AdfAutoScanConfig } from "../type/scanConfigs";
import PathHelper from "../PathHelper";
import { getLoggerForFile } from "../logger";

const logger = getLoggerForFile(__filename);

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
    logger.warn(
      "WARNING: The automatic scan feature is likely unsupported on this device, as its advertised capabilities do not include this feature.",
    );
  }

  if (adfAutoScanConfig.isDuplex && !deviceCapabilities.hasAdfDuplex) {
    logger.warn(
      "WARNING: The requested duplex scan method is likely unsupported on this device, as its advertised capabilities do not include this feature.",
    );
  }

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  while (keepActive) {
    iteration++;
    logger.info(`Iteration ${iteration} (Errors so far:${errorCount})`);
    try {
      await waitAdfLoaded(
        adfAutoScanConfig.pollingInterval,
        adfAutoScanConfig.startScanDelay,
        deviceCapabilities.getScanStatus,
      );

      scanCount++;

      logger.info(`Scan event captured, saving scan #${scanCount}`);

      await scanFromAdf(
        scanCount,
        folder,
        tempFolder,
        adfAutoScanConfig,
        deviceCapabilities,
        new Date(),
      );
    } catch (e) {
      logger.error(e);
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
