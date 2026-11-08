import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import path from "node:path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  collectSidecarFiles,
  scanDirectories,
  snapshotDirectories,
} from "../src/sidecarDetection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("sidecarDetection", () => {
  const tempDir = path.resolve(__dirname, "./tmp/sidecar-detection");
  const scanDir = path.join(tempDir, "scan");
  const otherDir = path.join(tempDir, "elsewhere");

  beforeEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(scanDir, { recursive: true });
    await fs.mkdir(otherDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("snapshotDirectories", () => {
    it("lists the regular files of a directory", async () => {
      await fs.writeFile(path.join(scanDir, "page1.jpg"), "x");

      const snapshot = await snapshotDirectories([scanDir]);

      expect([...snapshot]).to.deep.equal([path.join(scanDir, "page1.jpg")]);
    });

    it("lists files of nested directories", async () => {
      const nested = path.join(scanDir, "nested");
      await fs.mkdir(nested, { recursive: true });
      await fs.writeFile(path.join(nested, "deep.txt"), "x");
      await fs.writeFile(path.join(scanDir, "top.txt"), "x");

      const snapshot = await snapshotDirectories([scanDir]);

      expect([...snapshot].sort()).to.deep.equal(
        [
          path.join(scanDir, "top.txt"),
          path.join(scanDir, "nested", "deep.txt"),
        ].sort(),
      );
    });

    it("returns an empty set for a directory that does not exist", async () => {
      const snapshot = await snapshotDirectories([
        path.join(tempDir, "missing"),
      ]);

      expect(snapshot.size).to.equal(0);
    });

    it("ignores symlinks and other non regular entries", async () => {
      const target = path.join(scanDir, "real.txt");
      await fs.writeFile(target, "x");
      await fs.symlink(target, path.join(scanDir, "link.txt")).catch(() => {
        // Symlink creation may be denied; the entry is then simply absent.
      });

      const snapshot = await snapshotDirectories([scanDir]);

      expect([...snapshot]).to.deep.equal([target]);
    });

    it("does not repeat a directory given twice", async () => {
      await fs.writeFile(path.join(scanDir, "once.txt"), "x");

      const snapshot = await snapshotDirectories([scanDir, scanDir]);

      expect([...snapshot]).to.deep.equal([path.join(scanDir, "once.txt")]);
    });
  });

  describe("collectSidecarFiles", () => {
    const base = {
      before: new Set<string>(),
      knownFiles: [] as string[],
      directories: [scanDir],
    };

    it("reports a file that appeared during the pipeline", async () => {
      await fs.writeFile(path.join(scanDir, "report.txt"), "x");
      const after = await snapshotDirectories([scanDir]);

      expect(
        collectSidecarFiles({ ...base, before: new Set() }, after),
      ).to.deep.equal([path.join(scanDir, "report.txt")]);
    });

    it("ignores files that were already there", async () => {
      const existing = path.join(scanDir, "page1.jpg");
      await fs.writeFile(existing, "x");
      const before = await snapshotDirectories([scanDir]);
      const after = await snapshotDirectories([scanDir]);

      expect(collectSidecarFiles({ ...base, before }, after)).to.deep.equal([]);
    });

    it("ignores the files the scan owns", async () => {
      const page = path.join(scanDir, "page1.jpg");
      const pdf = path.join(scanDir, "scan.pdf");
      await fs.writeFile(page, "x");
      await fs.writeFile(pdf, "x");
      const before = new Set<string>();
      const after = await snapshotDirectories([scanDir]);

      const sidecars = collectSidecarFiles(
        { before, knownFiles: [page, pdf], directories: [scanDir] },
        after,
      );

      expect(sidecars).to.deep.equal([]);
    });

    it("ignores a scan file that disappeared", async () => {
      const page = path.join(scanDir, "page1.jpg");
      await fs.writeFile(page, "x");
      const before = await snapshotDirectories([scanDir]);
      await fs.rm(page);
      const after = await snapshotDirectories([scanDir]);

      expect(collectSidecarFiles({ ...base, before }, after)).to.deep.equal([]);
    });

    it("keeps the result sorted for stable logs", async () => {
      for (const name of ["zeta.txt", "alpha.txt", "middle.txt"]) {
        await fs.writeFile(path.join(scanDir, name), "x");
      }
      const after = await snapshotDirectories([scanDir]);

      const sidecars = collectSidecarFiles({ ...base }, after);

      expect(sidecars).to.deep.equal([
        path.join(scanDir, "alpha.txt"),
        path.join(scanDir, "middle.txt"),
        path.join(scanDir, "zeta.txt"),
      ]);
    });

    it("reports several sidecars produced in one run", async () => {
      for (const name of ["report.txt", "scan.p7s"]) {
        await fs.writeFile(path.join(scanDir, name), "x");
      }
      const after = await snapshotDirectories([scanDir]);

      expect(collectSidecarFiles({ ...base }, after)).to.have.lengthOf(2);
    });
  });

  describe("scanDirectories", () => {
    const pages = {
      elements: [
        { path: path.join(scanDir, "page1.jpg") },
        { path: path.join(scanDir, "page2.jpg") },
      ],
    };

    it("watches the directory holding the pages", () => {
      expect(scanDirectories(pages)).to.deep.equal([scanDir]);
    });

    it("adds the folders handed by the caller", () => {
      expect(scanDirectories(pages, [tempDir, otherDir])).to.have.members([
        scanDir,
        tempDir,
        otherDir,
      ]);
    });

    it("ignores null and undefined folders", () => {
      expect(scanDirectories(pages, [null, undefined, ""])).to.deep.equal([
        scanDir,
      ]);
    });

    it("deduplicates folders shared by several pages", () => {
      const shared = {
        elements: [
          { path: path.join(scanDir, "a.jpg") },
          { path: path.join(scanDir, "b.jpg") },
        ],
      };

      expect(scanDirectories(shared, [scanDir])).to.deep.equal([scanDir]);
    });
  });

  describe("end to end on the temp folder", () => {
    it("detects only what a hook wrote beside the scan", async () => {
      const page = path.join(scanDir, "page1.jpg");
      await fs.writeFile(page, "ORIGINAL");
      const before = await snapshotDirectories([scanDir]);

      // Simulates a hook appending to the page and writing a sidecar.
      await fs.writeFile(page, "ORIGINALX");
      await fs.writeFile(path.join(scanDir, "page1.txt"), "OCR");

      const after = await snapshotDirectories([scanDir]);
      const sidecars = collectSidecarFiles(
        { before, knownFiles: [page], directories: [scanDir] },
        after,
      );

      expect(sidecars).to.deep.equal([path.join(scanDir, "page1.txt")]);
      expect(existsSync(path.join(otherDir, "report.txt"))).to.be.false;
    });
  });
});
