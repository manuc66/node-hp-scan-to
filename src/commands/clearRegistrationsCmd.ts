import HPApi from "../HPApi";
import { getLoggerForFile } from "../logger";

const logger = getLoggerForFile(__filename);

export async function clearRegistrationsCmd() {
  const dests = await HPApi.getWalkupScanToCompDestinations();
  for (let i = 0; i < dests.destinations.length; i++) {
    logger.info(`Removing: ${dests.destinations[i].name}`);
    await HPApi.removeDestination(dests.destinations[i]);
  }
}
