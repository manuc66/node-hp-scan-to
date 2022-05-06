import path from "path";
import dateformat from "dateformat";
import fs from "fs/promises";
import os from "os";

export default class PathHelper {
  static getNextFile(
    folder: string,
    scanCount: number,
    currentPageNumber: number,
    filePattern : string | undefined, extension: string
  ): string {

    if (filePattern) {
      return path.join(folder, dateformat(new Date(), filePattern) + ".jpg");
    }

    return path.join(folder, `scan${scanCount}_page${currentPageNumber}.${extension}`);
  }

  static async getOutputFolder(folder: string | undefined) {
    if (!folder) {
      folder = await fs.mkdtemp(
        path.join(os.tmpdir(), "scan-to-pc")
      );
    }
    return folder;
  }
}
