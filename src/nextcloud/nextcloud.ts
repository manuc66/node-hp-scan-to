import axios, {AxiosError} from "axios";
import { ScanContent } from "../ScanContent";
import { NextcloudConfig } from "./NextcloudConfig";
import fs from "fs/promises";
import path from "path";

export async function uploadImageToNextcloud(
  scanJobContent: ScanContent,
  nextcloudConfig: NextcloudConfig,
) {
  scanJobContent.elements.map(async (element) => {
    const { path: filePath } = element;
    await uploadToNextcloud(filePath, nextcloudConfig);
    if (!nextcloudConfig.keepFiles) {
      await fs.unlink(filePath);
      console.log(
        `Image document ${filePath} has been removed from the filesystem`,
      );
    }
  });
}

export async function uploadPdfToNextcloud(
  pdfFilePath: string | null,
  nextcloudConfig: NextcloudConfig,
) {
  if (pdfFilePath) {
    await uploadToNextcloud(pdfFilePath, nextcloudConfig);
    if (!nextcloudConfig.keepFiles) {
      await fs.unlink(pdfFilePath);
      console.log(
        `Pdf document ${pdfFilePath} has been removed from the filesystem`,
      );
    }
  } else {
    console.log(
      "Pdf generation has failed, nothing is going to be uploaded to paperless",
    );
  }
}

async function uploadToNextcloud(
  filePath: string,
  nextcloudConfig: NextcloudConfig,
): Promise<void> {
  const { baseUrl, username, password, uploadFolder } = nextcloudConfig;
  const fileName = path.basename(filePath);
  const folderUrl = `${baseUrl}/remote.php/dav/files/${username}/${uploadFolder}`;
  const uploadUrl = `${folderUrl}/${fileName}`;

  const folderExists = await checkNextcloudFolderExists(nextcloudConfig);
  if (!folderExists) {
    console.error("Upload folder does not exist; skipping upload");
    return;
  }

  const fileBuffer: Buffer = await fs.readFile(filePath);

  const auth = { username, password };

  console.log(`Start uploading to nextcloud: ${fileName}`);
  try {
    await axios({
      method: "PUT",
      url: uploadUrl,
      auth,
      data: fileBuffer,
    });

    console.log(
      `Document successfully uploaded to Nextcloud: ${uploadFolder}/${fileName}`,
    );
  } catch (error) {
    console.error("Fail to upload document:", error);
  }
}

async function checkNextcloudFolderExists(
  nextcloudConfig: NextcloudConfig,
): Promise<boolean> {
  const { baseUrl, username, password, uploadFolder } = nextcloudConfig;
  const folderUrl = `${baseUrl}/remote.php/dav/files/${username}/${uploadFolder}`;
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
