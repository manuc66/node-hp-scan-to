import axios, { AxiosError } from "axios";
import { ScanContent } from "../type/ScanContent";
import { NextcloudConfig } from "./NextcloudConfig";
import fs from "node:fs/promises";
import path from "node:path";
import { getLoggerForFile } from "../logger";

const logger = getLoggerForFile(__filename);

export async function uploadImagesToNextcloud(
  scanJobContent: ScanContent,
  nextcloudConfig: NextcloudConfig,
) {
  await checkFolderAndUpload(nextcloudConfig, async () => {
    for (const element of scanJobContent.elements) {
      const { path: filePath } = element;
      await uploadToNextcloud(filePath, nextcloudConfig);
    }
  });
}

export async function uploadPdfToNextcloud(
  pdfFilePath: string | null,
  nextcloudConfig: NextcloudConfig,
) {
  await checkFolderAndUpload(nextcloudConfig, async () => {
    if (pdfFilePath) {
      await uploadToNextcloud(pdfFilePath, nextcloudConfig);
    } else {
      logger.error(
        "Pdf generation has failed, nothing is going to be uploaded to Nextcloud",
      );
    }
  });
}

async function uploadToNextcloud(
  filePath: string,
  nextcloudConfig: NextcloudConfig,
): Promise<void> {
  const { baseUrl, username, password, uploadFolder } = nextcloudConfig;
  const fileName = path.basename(filePath);

  const folderUrl = buildFolderUrl(baseUrl, username, uploadFolder);
  const uploadUrl = buildUrl(folderUrl, [fileName]);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch (e) {
    logger.error(e, "Fail to read file:", e);
    return;
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
  } catch (error) {
    logger.error(error, "Fail to upload document");
  }
}

async function checkFolderAndUpload(
  nextcloudConfig: NextcloudConfig,
  uploadFunction: () => Promise<void>,
) {
  const folderExists = await checkNextcloudFolderExists(nextcloudConfig);
  if (!folderExists) {
    logger.error(
      "Upload folder does not exist or user has no permission; skipping upload",
    );
    return;
  }

  await uploadFunction();
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
      logger.error(
        axiosError,
        "Fail to check upload folder exists:",
        axiosError.toJSON(),
      );
    }
    logger.debug(axiosError.response);
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
