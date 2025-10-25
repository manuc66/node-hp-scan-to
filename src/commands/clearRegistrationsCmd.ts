import HPApi from "../HPApi.js";

export async function clearRegistrationsCmd() {
  const dests = await HPApi.getWalkupScanToCompDestinations();
  for (const item of dests.destinations) {
    console.log(`Removing: ${item.name}`);
    await HPApi.removeDestination(item);
  }
}
