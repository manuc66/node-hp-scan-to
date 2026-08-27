import type DeviceClient from "../DeviceClient.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(__filename);

export async function clearRegistrationsCmd(api: DeviceClient) {
  const dests = await api.getWalkupScanToCompDestinations();
  for (const item of dests.destinations) {
    logger.info(`Removing: ${item.name}`);
    await api.removeDestination(item);
  }
}
