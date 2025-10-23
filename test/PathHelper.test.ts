import { describe } from "mocha";
import { expect } from "chai";
import PathHelper from "../src/PathHelper.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const now: Date = new Date();

describe("PathHelper", () => {
  describe("getFileForPage", () => {
    it("Can format a file with formatted timestamp", async () => {
      const nextFileName = PathHelper.getFileForPage(
        "someFolder",
        2,
        1,
        '"scan"_dd.mm.yyyy_HH:MM:ss',
        "jpg",
        now,
      );
      expect(nextFileName).to.be.eq(
        `someFolder${path.sep}scan_${("" + now.getDate()).padStart(2, "0")}.${(
          "" +
          (now.getMonth() + 1)
        ).padStart(2, "0")}.${("" + now.getFullYear()).padStart(4, "0")}_${(
          "" + now.getHours()
        ).padStart(2, "0")}:${("" + now.getMinutes()).padStart(2, "0")}:${(
          "" + now.getSeconds()
        ).padStart(2, "0")}.jpg`,
      );
    });
    it("Can format a file based on scan count and page number", async () => {
      const nextFileName = PathHelper.getFileForPage(
        "someFolder",
        2,
        1,
        undefined,
        "jpg",
        now,
      );
      expect(nextFileName).to.be.eq(`someFolder${path.sep}scan2_page1.jpg`);
    });
  });
  describe("getFileForScan", () => {
    it("Can format a file with formatted timestamp", async () => {
      const nextFileName = PathHelper.getFileForScan(
        "someFolder",
        2,
        '"scan"_dd.mm.yyyy_HH:MM:ss',
        "pdf",
        now,
      );
      expect(nextFileName).to.be.eq(
        `someFolder${path.sep}scan_${("" + now.getDate()).padStart(2, "0")}.${(
          "" +
          (now.getMonth() + 1)
        ).padStart(2, "0")}.${("" + now.getFullYear()).padStart(4, "0")}_${(
          "" + now.getHours()
        ).padStart(2, "0")}:${("" + now.getMinutes()).padStart(2, "0")}:${(
          "" + now.getSeconds()
        ).padStart(2, "0")}.pdf`,
      );
    });
    it("Can format a file based on scan count and page number", async () => {
      const nextFileName = PathHelper.getFileForScan(
        "someFolder",
        2,
        undefined,
        "pdf",
        now,
      );
      expect(nextFileName).to.be.eq(`someFolder${path.sep}scan2.pdf`);
    });
  });
  describe("getOutputFolder", () => {
    describe("A folder given", () => {
      it("it is returned", async () => {
        const folder = await PathHelper.getOutputFolder("someFolder");
        expect(folder).to.be.eq("someFolder");
      });
      it("it replaces ~ with home directory", async () => {
        const folder = await PathHelper.getOutputFolder("~/someFolder");
        expect(folder).to.be.eq(path.join(os.homedir(), "someFolder"));
      });
    });
    describe("No folder given", () => {
      it("it return a temp folder", async () => {
        const folder = await PathHelper.getOutputFolder();
        expect(folder).to.satisfy((str: string) => str.startsWith(os.tmpdir()));
      });
      it("it return a folder that exist", async () => {
        const folder = await PathHelper.getOutputFolder();
        expect(fs.existsSync(folder)).to.be.eq(true);
      });
      it("it return a different folder for every call", async () => {
        const folder = await PathHelper.getOutputFolder();
        expect(folder).to.be.not.eq(await PathHelper.getOutputFolder());
      });
    });
  });
  describe("makeUnique", () => {
    it("return the file if it does not exist first", async () => {
      const folder = await PathHelper.getOutputFolder();
      const filePath = path.join(folder, "someFolder.pdf");

      const uniqueFile = PathHelper.makeUnique(filePath, now);

      expect(filePath).to.be.eq(uniqueFile);
    });

    it("return another file in case of conflict", async () => {
      const folder = await PathHelper.getOutputFolder();
      const filePath = path.join(folder, "someFolder.pdf");
      fs.openSync(filePath, "w");

      const uniqueFile = PathHelper.makeUnique(filePath, now);

      expect(filePath).to.be.not.eq(uniqueFile);
    });

    it("return another two conflict", async () => {
      const folder = await PathHelper.getOutputFolder();
      const filePath = path.join(folder, "someFolder.pdf");
      fs.openSync(filePath, "w");
      const another = PathHelper.makeUnique(filePath, now);
      fs.openSync(another, "w");

      const uniqueFile = PathHelper.makeUnique(filePath, now);

      expect(filePath).to.be.not.eq(uniqueFile);
      expect(another).to.be.not.eq(uniqueFile);
    });

    it("conflict resolution terminate with error", async () => {
      const folder = await PathHelper.getOutputFolder();
      const filePath = path.join(folder, "someFolder.pdf");
      fs.openSync(filePath, "w");

      expect(() => {
        for (let i = 0; i < 50; ++i) {
          const another = PathHelper.makeUnique(filePath, now);
          fs.openSync(another, "w");
        }
      }).to.throw(/Can not create unique file:/);
    });
  });
  describe("getTargetFolder", () => {
    it("should throw an error if the folder does not exist", async () => {
      const nonExistentFolder = path.join(os.homedir(), "non-existent-folder");
      try {
        await PathHelper.getTargetFolder(nonExistentFolder);
        // If the promise resolves, we want to fail the test
        expect.fail(
          `Expected an error for folder "${nonExistentFolder}" but got none.`,
        );
      } catch (error: unknown) {
        if (error instanceof Error) {
          expect(error.message).to.equal(
            `The folder "${nonExistentFolder}" does not exist or is not writable.`,
          );
        } else {
          throw error; // Re-throw if it's not an Error object
        }
      }
    });
    it("should throw an error if the folder is not writable", async () => {
      const readOnlyFolder = path.join(os.tmpdir(), "read-only-folder");
      await fs.promises.mkdir(readOnlyFolder, { recursive: true });
      await fs.promises.chmod(readOnlyFolder, 0o444); // Set to read-only

      try {
        await PathHelper.getTargetFolder(readOnlyFolder);
        // If the promise resolves, we want to fail the test
        expect.fail(
          `Expected an error for folder "${readOnlyFolder}" but got none.`,
        );
      } catch (error: unknown) {
        if (error instanceof Error) {
          expect(error.message).to.equal(
            `The folder "${readOnlyFolder}" does not exist or is not writable.`,
          );
        } else {
          throw error; // Re-throw if it's not an Error object
        }
      }

      // Clean up: Restore permissions and remove the folder
      await fs.promises.chmod(readOnlyFolder, 0o755); // Set back to writable
      await fs.promises.rmdir(readOnlyFolder);
    });
  });

  describe("getTempFolder", () => {
    it("should throw an error if the folder does not exist", async () => {
      const nonExistentFolder = path.join(os.homedir(), "non-existent-folder");
      try {
        await PathHelper.getTempFolder(nonExistentFolder);
        // If the promise resolves, we want to fail the test
        expect.fail(
          `Expected an error for folder "${nonExistentFolder}" but got none.`,
        );
      } catch (error: unknown) {
        if (error instanceof Error) {
          expect(error.message).to.equal(
            `The folder "${nonExistentFolder}" does not exist or is not writable.`,
          );
        } else {
          throw error; // Re-throw if it's not an Error object
        }
      }
    });
    it("should throw an error if the folder is not writable", async () => {
      const readOnlyFolder = path.join(os.tmpdir(), "read-only-folder");
      await fs.promises.mkdir(readOnlyFolder, { recursive: true });
      await fs.promises.chmod(readOnlyFolder, 0o444); // Set to read-only

      try {
        await PathHelper.getTempFolder(readOnlyFolder);
        // If the promise resolves, we want to fail the test
        expect.fail(
          `Expected an error for folder "${readOnlyFolder}" but got none.`,
        );
      } catch (error: unknown) {
        if (error instanceof Error) {
          expect(error.message).to.equal(
            `The folder "${readOnlyFolder}" does not exist or is not writable.`,
          );
        } else {
          throw error; // Re-throw if it's not an Error object
        }
      }

      // Clean up: Restore permissions and remove the folder
      await fs.promises.chmod(readOnlyFolder, 0o755); // Set back to writable
      await fs.promises.rmdir(readOnlyFolder);
    });
  });
});
