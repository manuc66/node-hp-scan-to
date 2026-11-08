import axios, { type AxiosError } from "axios";
import type { ScanContent } from "../type/ScanContent.js";
import type { NextcloudConfig } from "./NextcloudConfig.js";
import fs from "node:fs/promises";
import path from "node:path";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

export async function uploadImagesToNextcloud(
  scanJobContent: ScanContent,
  nextcloudConfig: NextcloudConfig,
): Promise<string[]> {
  return await uploadFilesToNextcloud(
    scanJobContent.elements.map((element) => element.path),
    nextcloudConfig,
  );
}

/**
 * Uploads an arbitrary list of files, used for the sidecars a post-processing
 * hook wrote beside the scan.
 */
export async function uploadFilesToNextcloud(
  filePaths: readonly string[],
  nextcloudConfig: NextcloudConfig,
): Promise<string[]> {
  return await checkFolderAndUpload(nextcloudConfig, async () => {
    const urls: string[] = [];
    for (const filePath of filePaths) {
      urls.push(await uploadToNextcloud(filePath, nextcloudConfig));
    }
    return urls;
  });
}

export async function uploadPdfToNextcloud(
  pdfFilePath: string | null,
  nextcloudConfig: NextcloudConfig,
): Promise<string[]> {
  return await checkFolderAndUpload(nextcloudConfig, async () => {
    if (pdfFilePath === null) {
      logger.error(
        "Pdf generation has failed, nothing is going to be uploaded to Nextcloud",
      );
      return [];
    }
    return [await uploadToNextcloud(pdfFilePath, nextcloudConfig)];
  });
}

export function nextcloudWebdavFileUrl(
  nextcloudConfig: NextcloudConfig,
  fileName: string,
): string {
  const folderUrl = buildFolderUrl(
    nextcloudConfig.baseUrl,
    nextcloudConfig.username,
    nextcloudConfig.uploadFolder,
  );
  return buildUrl(folderUrl, [fileName]);
}

/**
 * Uploads one file and returns the WebDAV URL it now lives at, which is the
 * handle a consumer of the webhook event needs to fetch it.
 */
async function uploadToNextcloud(
  filePath: string,
  nextcloudConfig: NextcloudConfig,
): Promise<string> {
  const { baseUrl, username, password, uploadFolder } = nextcloudConfig;
  const fileName = path.basename(filePath);

  const folderUrl = buildFolderUrl(baseUrl, username, uploadFolder);
  const uploadUrl = buildUrl(folderUrl, [fileName]);

  let fileBuffer: Buffer;
  try {
    // NOSONAR: filePath is a scan file produced by the app.
    fileBuffer = await fs.readFile(filePath);
  } catch (e) {
    logger.error(e, "Fail to read file");
    throw e;
  }
  const auth = { username, password };

  logger.info(`Start uploading to Nextcloud: ${fileName}`);
  try {
    const response = await axios({
      method: "PUT",
      url: uploadUrl,
      auth,
      data: fileBuffer,
    });

    let action: string;
    if (response.status === 201) {
      action = "created";
    } else {
      action = "updated";
    }
    logger.info(
      `Document successfully ${action} file at Nextcloud. (Folder: ${uploadFolder}, File: ${fileName})`,
    );
    return uploadUrl;
  } catch (error) {
    logger.error(error, "Fail to upload document");
    throw error;
  }
}

async function checkFolderAndUpload<T>(
  nextcloudConfig: NextcloudConfig,
  uploadFunction: () => Promise<T>,
): Promise<T> {
  const folderExists = await checkNextcloudFolderExists(nextcloudConfig);
  if (!folderExists) {
    throw new Error(
      `Upload folder '${nextcloudConfig.uploadFolder}' does not exist or user has no permission`,
    );
  }

  return await uploadFunction();
}

async function checkNextcloudFolderExists(
  nextcloudConfig: NextcloudConfig,
): Promise<boolean> {
  const { baseUrl, username, password, uploadFolder } = nextcloudConfig;
  const folderUrl = buildFolderUrl(baseUrl, username, uploadFolder);
  const auth = { username, password };

  logger.info("Check if upload folder exists");
  try {
    // Check if the upload folder exists
    await axios({
      method: "PROPFIND",
      url: folderUrl,
      auth,
      headers: { Depth: 0 },
    });
    logger.info(`Found upload folder '${uploadFolder}' in Nextcloud`);
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) {
      logger.warn(`Upload folder '${uploadFolder}' not found in Nextcloud`);
    } else if (axiosError.response?.status === 401) {
      logger.warn(
        `User has no permission to access upload folder '${uploadFolder}' in Nextcloud`,
      );
    } else {
      logger.error(axiosError, "Fail to check upload folder exists");
    }
    logger.debug(
      { status: axiosError.response?.status },
      "Nextcloud folder check failed",
    );
    return false;
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
