import HPApi from "../HPApi";

export async function clearRegistrationsCmd() {
  const dests = await HPApi.getWalkupScanToCompDestinations();
  for (let i = 0; i < dests.destinations.length; i++) {
    console.log(`Removing: ${dests.destinations[i].name}`);
    await HPApi.removeDestination(dests.destinations[i]);
  }
}
