import path from "node:path";
import os from "node:os";
import fs, { promises as Fs } from "node:fs";
import dateformat from "dateformat";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
  "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
  6,
);

export default class PathHelper {
  static async getFileForPage(
    folder: string,
    scanCount: number,
    currentPageNumber: number,
    filePattern: string | undefined,
    extension: string,
    date: Date,
  ): Promise<string> {
    if (filePattern !== undefined) {
      return this.makeUnique(
        path.join(folder, `${dateformat(date, filePattern)}.${extension}`),
        date,
      );
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
    if (filePattern !== undefined) {
      return ++currentScanCount;
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

  static async makeUnique(filePath: string, date: Date): Promise<string> {
    if (await this.tryCreateFile(filePath)) {
      return filePath;
    }

    const { dir, name, ext } = path.parse(filePath);

    const dateStamp = dateformat(date, "yyyymmdd-HHMMss");

    let baseName: string;
    if (name.includes(dateStamp)) {
      baseName = name;
    } else {
      baseName = `${name}_${dateStamp}`;
      const pathWithDate = path.join(dir, `${baseName}${ext}`);
      if (await this.tryCreateFile(pathWithDate)) {
        return pathWithDate;
      }
    }

    // Retry nanoid a few times (paranoid safety) -- be bit para-nanoid ;-)
    for (let i = 0; i < 3; i++) {
      const finalPath = path.join(dir, `${baseName}_${nanoid()}${ext}`);
      if (await this.tryCreateFile(finalPath)) {
        return finalPath;
      }
    }

    // if the world collapses, who knows, who cares?
    throw new Error(`Failed to create unique file: ${filePath}`);
  }

  private static async tryCreateFile(filePath: string): Promise<boolean> {
    try {
      const fd = await fs.promises.open(filePath, "wx");
      await fd.close();
      return true;
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "EEXIST") {
        return false;
      }
      throw err;
    }
  }

  static async getFileForScan(
    folder: string,
    scanCount: number,
    filePattern: string | undefined,
    extension: string,
    date: Date,
  ): Promise<string> {
    if (filePattern !== undefined) {
      return await this.makeUnique(
        path.join(folder, `${dateformat(date, filePattern)}.${extension}`),
        date,
      );
    }

    return await this.makeUnique(
      path.join(folder, `scan${scanCount}.${extension}`),
      date,
    );
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

  static async getTargetFolder(directory: string | undefined): Promise<string> {
    const folder = await PathHelper.getOutputFolder(directory);
    console.log(`Output folder: ${folder}`);
    await this.checkIfFolderIsWritable(folder);
    return folder;
  }

  static async getTempFolder(directory: string | undefined): Promise<string> {
    const tempFolder = await PathHelper.getOutputFolder(directory);
    console.log(`Temporary folder: ${tempFolder}`);
    await this.checkIfFolderIsWritable(tempFolder);
    return tempFolder;
  }

  static getPathFromHttpLocation(input: string): string {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      const url = new URL(input);
      return url.pathname; // Extract path from URL
    } else {
      return input; // Return the rooted path directly
    }
  }
}
