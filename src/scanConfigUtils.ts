import PathHelper from "./PathHelper";

export async function getTargetFolder(directory: string | undefined) {
  const folder = await PathHelper.getOutputFolder(directory);
  console.log(`Target folder: ${folder}`);
  return folder;
}

export async function getTempFolder(directory: string | undefined) {
  const tempFolder = await PathHelper.getOutputFolder(directory);
  console.log(`Temp folder: ${tempFolder}`);
  return tempFolder;
}
