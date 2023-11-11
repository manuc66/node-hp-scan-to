import path from "path";
import dateformat from "dateformat";
import os from "os";
import { promises as Fs } from "fs";
import fs from "fs";

export default class PathHelper {
  static getFileForPage(
    folder: string,
    scanCount: number,
    currentPageNumber: number,
    filePattern: string | undefined,
    extension: string,
  ): string {
    if (filePattern) {
      return path.join(
        folder,
        `${dateformat(new Date(), filePattern)}.${extension}`,
      );
    }

    return this.makeUnique(
      path.join(
        folder,
        `scan${scanCount}_page${currentPageNumber}.${extension}`,
      ),
    );
  }

  static async getNextScanNumber(
    folder: string,
    currentScanCount: number,
    filePattern: string | undefined,
  ): Promise<number> {
    if (filePattern) {
      return currentScanCount++;
    }
    const files = await Fs.readdir(folder);
    for (let i = currentScanCount + 1; i < Number.MAX_SAFE_INTEGER; i++) {
      const currentScanCountProbe = `scan${i}`;
      if (
        !(
          files.some((x) => x.startsWith(currentScanCountProbe)) &&
          files.some(
            (x) =>
              x.startsWith(currentScanCountProbe + "_") ||
              files.some((x) => x.startsWith(currentScanCountProbe + ".")),
          )
        )
      ) {
        return i;
      }
    }
    return Promise.reject(
      `Unable to find the valid scan number in folder ${folder}`,
    );
  }

  static makeUnique(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      return filePath;
    }

    let parsed = path.parse(filePath);
    let tryName = `${parsed.dir}${path.sep}${parsed.name}_${dateformat(
      new Date(),
      "yyyymmdd",
    )}${parsed.ext}`;
    if (!fs.existsSync(tryName)) {
      return tryName;
    }

    parsed = path.parse(tryName);
    let i = "a";
    while (i <= "z") {
      tryName = `${parsed.dir}${path.sep}${parsed.name}_${i}${parsed.ext}`;
      if (!fs.existsSync(tryName)) {
        return tryName;
      }
      i = String.fromCharCode(i.charCodeAt(0) + 1);
    }
    throw new Error(
      `Can not create unique file: ${filePath} iterated until: ${tryName}`,
    );
  }

  static getFileForScan(
    folder: string,
    scanCount: number,
    filePattern: string | undefined,
    extension: string,
  ): string {
    if (filePattern) {
      return path.join(
        folder,
        `${dateformat(new Date(), filePattern)}.${extension}`,
      );
    }

    return path.join(folder, `scan${scanCount}.${extension}`);
  }

  static async getOutputFolder(folder?: string | undefined): Promise<string> {
    if (typeof folder !== "string") {
      return Fs.mkdtemp(path.join(os.tmpdir(), "scan-to-pc"));
    }
    return folder;
  }
}
