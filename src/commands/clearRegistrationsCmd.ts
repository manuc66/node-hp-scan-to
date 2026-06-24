import type DeviceClient from "../DeviceClient.js";

export async function clearRegistrationsCmd(api: DeviceClient) {
  const dests = await api.getWalkupScanToCompDestinations();
  for (const item of dests.destinations) {
    console.log(`Removing: ${item.name}`);
    await api.removeDestination(item);
  }
}
