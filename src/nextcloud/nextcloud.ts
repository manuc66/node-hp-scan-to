import axios, { AxiosError } from "axios";
import { ScanContent } from "../ScanContent";
import { NextcloudConfig } from "./NextcloudConfig";
import fs from "fs/promises";
import path from "path";

export async function uploadImagesToNextcloud(
  scanJobContent: ScanContent,
  nextcloudConfig: NextcloudConfig,
) {
  await Promise.all(
    scanJobContent.elements.map(async (element) => {
      const { path: filePath } = element;
      await uploadToNextcloud(filePath, nextcloudConfig);
    }),
  );
}

export async function uploadPdfToNextcloud(
  pdfFilePath: string | null,
  nextcloudConfig: NextcloudConfig,
) {
  if (pdfFilePath) {
    await uploadToNextcloud(pdfFilePath, nextcloudConfig);
  } else {
    console.log(
      "Pdf generation has failed, nothing is going to be uploaded to Nextcloud",
    );
  }
}

async function uploadToNextcloud(
  filePath: string,
  nextcloudConfig: NextcloudConfig,
): Promise<void> {
  const { baseUrl, username, password, uploadFolder } = nextcloudConfig;
  const fileName = path.basename(filePath);
  const folderUrl = buildFolderUrl(baseUrl, username, uploadFolder);
  const uploadUrl = buildUrl(folderUrl, [fileName]);

  const folderExists = await checkNextcloudFolderExists(nextcloudConfig);
  if (!folderExists) {
    console.error("Upload folder does not exist; skipping upload");
    return;
  }

  const fileBuffer: Buffer = await fs.readFile(filePath);

  const auth = { username, password };

  console.log(`Start uploading to Nextcloud: ${fileName}`);
  try {
    await axios({
      method: "PUT",
      url: uploadUrl,
      auth,
      data: fileBuffer,
    });

    console.log(
      `Document successfully uploaded to Nextcloud. (Folder: ${uploadFolder}, File: ${fileName}`,
    );
  } catch (error) {
    console.error("Fail to upload document:", error);
  }
}

async function checkNextcloudFolderExists(
  nextcloudConfig: NextcloudConfig,
): Promise<boolean> {
  const { baseUrl, username, password, uploadFolder } = nextcloudConfig;
  const folderUrl = buildFolderUrl(baseUrl, username, uploadFolder);
  const auth = { username, password };

  console.log("Check if upload folder exists");
  try {
    // Check if the upload folder exists
    await axios({
      method: "PROPFIND",
      url: folderUrl,
      auth,
      headers: { Depth: 0 },
    });
    console.log(`Found upload folder '${uploadFolder}' in Nextcloud`);
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      console.error(`Upload folder '${uploadFolder}' not found in Nextcloud`);
      return false;
    }
    throw error;
  }
  return true;
}

function buildFolderUrl(
  baseUrl: string,
  username: string,
  uploadFolder: string,
) {
  return buildUrl(baseUrl, [
    "remote.php",
    "dav",
    "files",
    username,
    uploadFolder,
  ]);
}

function buildUrl(baseUrl: string, path: string[]): string {
  const url = new URL(baseUrl);
  const search = /^\/+|\/+$/g;
  path.forEach((part) => {
    url.pathname = `${url.pathname.replace(search, "")}/${encodeURIComponent(part.replace(search, ""))}`;
  });
  return url.toString();
}
