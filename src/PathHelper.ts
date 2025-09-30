import path from "path";
import dateformat from "dateformat";
import os from "os";
import fs, { promises as Fs } from "fs";

export default class PathHelper {
  static getFileForPage(
    folder: string,
    scanCount: number,
    currentPageNumber: number,
    filePattern: string | undefined,
    extension: string,
    date: Date,
  ): string {
    if (filePattern) {
      return this.makeUnique(path.join(folder, `${dateformat(date, filePattern)}.${extension}`), date);
    }

    return this.makeUnique(
      path.join(
        folder,
        `scan${scanCount}_page${currentPageNumber}.${extension}`,
      ),
      date,
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
      new Error(`Unable to find the valid scan number in folder ${folder}`),
    );
  }

  static makeUnique(filePath: string, date: Date): string {
    if (!fs.existsSync(filePath)) {
      return filePath;
    }

    let parsed = path.parse(filePath);
    const s = dateformat(
      date,
      "yyyymmdd",
    );

    let tryName: string;
    if (!parsed.name.includes(s)) {
      tryName = `${parsed.dir}${path.sep}${parsed.name}_${s}${parsed.ext}`;
      if (!fs.existsSync(tryName)) {
        return tryName;
      }
    }
    else {
      tryName = `${parsed.dir}${path.sep}${parsed.name}${parsed.ext}`;
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
    date: Date,
  ): string {
    if (filePattern) {
      return path.join(folder, `${dateformat(date, filePattern)}.${extension}`);
    }

    return path.join(folder, `scan${scanCount}.${extension}`);
  }

  static async getOutputFolder(folder?: string): Promise<string> {
    if (typeof folder !== "string") {
      return Fs.mkdtemp(path.join(os.tmpdir(), "scan-to-pc"));
    }

    if (folder.startsWith("~")) {
      return folder.replace(/^~/, os.homedir());
    }
    return folder;
  }

  private static async checkIfFolderIsWritable(folder: string) {
    // Check if the folder exists
    try {
      await fs.promises.access(folder, fs.constants.W_OK);
      return folder; // The folder exists and is writable
    } catch {
      // If the folder does not exist or is not writable, handle the error
      throw new Error(
        `The folder "${folder}" does not exist or is not writable.`,
      );
    }
  }

  static async getTargetFolder(directory: string | undefined) {
    const folder = await PathHelper.getOutputFolder(directory);
    console.log(`Target folder: ${folder}`);
    await this.checkIfFolderIsWritable(folder);
    return folder;
  }

  static async getTempFolder(directory: string | undefined) {
    const tempFolder = await PathHelper.getOutputFolder(directory);
    console.log(`Temp folder: ${tempFolder}`);
    await this.checkIfFolderIsWritable(tempFolder);
    return tempFolder;
  }

  static getPathFromHttpLocation(input: string) {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      const url = new URL(input);
      return url.pathname; // Extract path from URL
    } else {
      return input; // Return the rooted path directly
    }
  }
}
