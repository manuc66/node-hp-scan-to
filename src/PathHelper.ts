import path from "path";
import dateformat from "dateformat";
const { promises: Fs } = require("fs");
const fs = require("fs");
import os from "os";

export default class PathHelper {
  static getFileForPage(
    folder: string,
    scanCount: number,
    currentPageNumber: number,
    filePattern: string | undefined,
    extension: string
  ): string {
    if (filePattern) {
      return path.join(
        folder,
        `${dateformat(new Date(), filePattern)}.${extension}`
      );
    }

    return path.join(
      folder,
      `scan${scanCount}_page${currentPageNumber}.${extension}`
    );
  }

  static makeUnique(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      return filePath;
    }

    let parsed = path.parse(filePath);
    let tryName = `${parsed.dir}${path.sep}${parsed.name}${dateformat(
      new Date(),
      "yyyymmdd"
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
      `Can not create unique file: ${filePath} iterated until: ${tryName}`
    );
  }

  static getFileForScan(
    folder: string,
    scanCount: number,
    filePattern: string | undefined,
    extension: string
  ): string {
    if (filePattern) {
      return path.join(
        folder,
        `${dateformat(new Date(), filePattern)}.${extension}`
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
