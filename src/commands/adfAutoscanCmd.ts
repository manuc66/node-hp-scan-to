import type DeviceClient from "../DeviceClient.js";
import { readDeviceCapabilities } from "../readDeviceCapabilities.js";
import { scanFromAdf, waitAdfLoaded } from "../scanProcessing.js";
import PathHelper from "../PathHelper.js";
import type { DeviceCapabilities } from "../type/DeviceCapabilities.js";
import type { AdfAutoScanConfig } from "../type/scanConfigs.js";

let iteration = 0;

function checkCapabilities(
  adfAutoScanConfig: AdfAutoScanConfig,
  deviceCapabilities: DeviceCapabilities,
) {
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
}

async function executeAutoscanIteration(
  api: DeviceClient,
  adfAutoScanConfig: AdfAutoScanConfig,
  deviceCapabilities: DeviceCapabilities,
  folder: string,
  tempFolder: string,
  scanCount: number,
): Promise<{ success: boolean; isDeviceAlive: boolean }> {
  try {
    await waitAdfLoaded(
      api,
      adfAutoScanConfig.pollingInterval,
      adfAutoScanConfig.startScanDelay,
      deviceCapabilities.getScanStatus,
    );

    console.log(`Scan event captured, saving scan #${scanCount}`);

    await scanFromAdf(
      api,
      scanCount,
      folder,
      tempFolder,
      adfAutoScanConfig,
      deviceCapabilities,
      new Date(),
    );
    return { success: true, isDeviceAlive: true };
  } catch (e) {
    if (e instanceof Error) {
      console.log(e.message);
    } else {
      console.log(e);
    }
    const isAlive = await api.isAlive();
    return { success: false, isDeviceAlive: isAlive };
  }
}

async function handleLoopDelayOrTermination(
  api: DeviceClient,
  errorCount: number,
  deviceUp: boolean,
  deviceUpPollingInterval: number,
): Promise<{ keepActive: boolean; deviceUp: boolean }> {
  const keepActive = errorCount < 50;

  if (!deviceUp) {
    await api.waitDeviceUp(deviceUpPollingInterval);
    return { keepActive, deviceUp: true };
  }

  await api.delay(1000);
  return { keepActive, deviceUp };
}

export async function adfAutoscanCmd(
  api: DeviceClient,
  adfAutoScanConfig: AdfAutoScanConfig,
  deviceUpPollingInterval: number,
): Promise<void> {
  await api.waitDeviceUp(deviceUpPollingInterval);

  const folder = await PathHelper.getTargetFolder(
    adfAutoScanConfig.directoryConfig.directory,
  );
  const tempFolder = await PathHelper.getTempFolder(
    adfAutoScanConfig.directoryConfig.tempDirectory,
  );

  const deviceCapabilities = await readDeviceCapabilities(
    api,
    adfAutoScanConfig.preferEscl,
  );

  checkCapabilities(adfAutoScanConfig, deviceCapabilities);

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  let deviceUp = true;

  while (keepActive) {
    iteration++;
    console.log(`Iteration ${iteration} (Errors so far: ${errorCount})`);

    const result = await executeAutoscanIteration(
      api,
      adfAutoScanConfig,
      deviceCapabilities,
      folder,
      tempFolder,
      scanCount + 1,
    );

    if (result.success) {
      scanCount++;
    }
    if (!result.success && result.isDeviceAlive) {
      errorCount++;
    }
    if (!result.success && !result.isDeviceAlive) {
      deviceUp = false;
    }

    const nextState = await handleLoopDelayOrTermination(
      api,
      errorCount,
      deviceUp,
      deviceUpPollingInterval,
    );
    keepActive = nextState.keepActive;
    deviceUp = nextState.deviceUp;
  }
}
