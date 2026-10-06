import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import { createPdfFrom } from "../src/pdfProcessing.js";
import {
  DEFAULT_POST_PROCESSING_TIMEOUT_MS,
  FALLBACK_POST_PROCESSING_TIMEOUT_MS,
  resolveTimeout,
  runFilePostProcessing,
} from "../src/filePostProcessing.js";
import type { ScanPage } from "../src/type/ScanContent.js";
import path from "node:path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const writeOutputTemplate = [
  "node",
  "-e",
  "require('fs').writeFileSync(process.argv[1],'HOOKED')",
  "{output}",
];
const copyTemplate = [
  "node",
  "-e",
  "require('fs').copyFileSync(process.argv[1],process.argv[2])",
  "{input}",
  "{output}",
];
const appendTemplate = [
  "node",
  "-e",
  "require('fs').appendFileSync(process.argv[1],'X')",
  "{input}",
];
const exitTemplate = ["node", "-e", "process.exit(3)", "{input}"];
const emptyOutputTemplate = ["node", "-e", "", "{output}"];

describe("File post-processing command hook", () => {
  const assetDir = path.resolve(__dirname, "./asset");
  const tempDir = path.resolve(__dirname, "./tmp");
  const pdfProcessingSampleJpg = path.join(
    assetDir,
    "pdf_processing_sample.jpg",
  );

  function makePage(): ScanPage {
    return {
      pageNumber: 1,
      path: pdfProcessingSampleJpg,
      width: 800,
      height: 600,
      xResolution: 100,
      yResolution: 100,
    };
  }

  beforeEach(async () => {
    if (!existsSync(tempDir)) {
      await fs.mkdir(tempDir, { recursive: true });
    }
    if (!existsSync(assetDir)) {
      await fs.mkdir(assetDir, { recursive: true });
    }
    if (!existsSync(pdfProcessingSampleJpg)) {
      await fs.writeFile(pdfProcessingSampleJpg, "fake-jpg-content");
    }
  });

  it("replaces the file with the {output} one on success", async () => {
    const dest = path.join(tempDir, "hook-output.pdf");
    await createPdfFrom(
      { elements: [makePage()] },
      dest,
      undefined,
      writeOutputTemplate,
    );
    expect(await fs.readFile(dest, "utf8")).to.equal("HOOKED");
    await fs.unlink(dest);
  });

  it("atomically replaces the file when the hook copies to {output}", async () => {
    const dest = path.join(tempDir, "hook-copy.pdf");
    await createPdfFrom(
      { elements: [makePage()] },
      dest,
      undefined,
      copyTemplate,
    );
    expect(existsSync(dest)).to.be.true;
    expect(await fs.readFile(dest, "utf8")).to.include("%PDF");
    await fs.unlink(dest);
  });

  it("keeps the hook result when the template modifies the file in place", async () => {
    const dest = path.join(tempDir, "hook-inplace.pdf");
    await createPdfFrom(
      { elements: [makePage()] },
      dest,
      undefined,
      appendTemplate,
    );
    const content = await fs.readFile(dest, "utf8");
    expect(content.endsWith("X")).to.be.true;
    await fs.unlink(dest);
  });

  it("keeps the original file when the hook exits with a non-zero code", async () => {
    const dest = path.join(tempDir, "hook-fail.pdf");
    await createPdfFrom(
      { elements: [makePage()] },
      dest,
      undefined,
      exitTemplate,
    );
    expect(existsSync(dest)).to.be.true;
    expect(await fs.readFile(dest, "utf8")).to.include("%PDF");
    await fs.unlink(dest);
  });

  it("keeps the original file when the hook produces no {output} file", async () => {
    const dest = path.join(tempDir, "hook-nooutput.pdf");
    await createPdfFrom(
      { elements: [makePage()] },
      dest,
      undefined,
      emptyOutputTemplate,
    );
    expect(existsSync(dest)).to.be.true;
    expect(await fs.readFile(dest, "utf8")).to.include("%PDF");
    await fs.unlink(dest);
  });

  it("does nothing for an empty command", async () => {
    const dest = path.join(tempDir, "hook-empty.pdf");
    await createPdfFrom({ elements: [makePage()] }, dest, undefined, []);
    expect(existsSync(dest)).to.be.true;
    expect(await fs.readFile(dest, "utf8")).to.include("%PDF");
    await fs.unlink(dest);
  });

  describe("file name is never interpreted as shell syntax", () => {
    // The command is spawned without a shell, so a file name holding shell
    // metacharacters stays a single argument and is never re-parsed.
    const appendToInput = [
      "node",
      "-e",
      "require('fs').appendFileSync(process.argv[1],'X')",
      "{input}",
    ];
    const metaDir = path.join(tempDir, "hook-shell-meta");

    async function tempFile(name: string, content: string): Promise<string> {
      await fs.mkdir(metaDir, { recursive: true });
      const target = path.join(metaDir, name);
      await fs.writeFile(target, content);
      return target;
    }

    async function cleanUp(): Promise<void> {
      await fs.rm(metaDir, { recursive: true, force: true });
    }

    it("post-processes a file whose name contains spaces", async () => {
      const target = await tempFile("my scan 2026.pdf", "ORIGINAL");

      try {
        await runFilePostProcessing(appendToInput, target);

        expect(await fs.readFile(target, "utf8")).to.equal("ORIGINALX");
      } finally {
        await cleanUp();
      }
    });

    it("post-processes a file whose name contains a single quote", async () => {
      const target = await tempFile("o'brien scan.pdf", "ORIGINAL");

      try {
        await runFilePostProcessing(appendToInput, target);

        expect(await fs.readFile(target, "utf8")).to.equal("ORIGINALX");
      } finally {
        await cleanUp();
      }
    });

    it("post-processes a file whose name contains a double quote", async () => {
      const target = await tempFile('say "hi".pdf', "ORIGINAL");

      try {
        await runFilePostProcessing(appendToInput, target);

        expect(await fs.readFile(target, "utf8")).to.equal("ORIGINALX");
      } finally {
        await cleanUp();
      }
    });

    it("post-processes a file whose name contains a dollar sign", async () => {
      const target = await tempFile("invoice$42.pdf", "ORIGINAL");

      try {
        await runFilePostProcessing(appendToInput, target);

        expect(await fs.readFile(target, "utf8")).to.equal("ORIGINALX");
      } finally {
        await cleanUp();
      }
    });

    it("post-processes a file whose name contains a semicolon", async () => {
      const target = await tempFile("scan; rm -rf x.pdf", "ORIGINAL");

      try {
        await runFilePostProcessing(appendToInput, target);

        expect(await fs.readFile(target, "utf8")).to.equal("ORIGINALX");
      } finally {
        await cleanUp();
      }
    });

    it("does not let a file name run an extra command", async () => {
      // The hook runs with the temp folder as its working directory, so the
      // injected `rm -rf sentinel.txt` is observable: it can only execute if
      // the file name is re-parsed as shell syntax.
      const sentinel = path.join(metaDir, "sentinel.txt");
      const target = await tempFile(
        'x"; rm -rf sentinel.txt; "y.pdf',
        "ORIGINAL",
      );
      await fs.writeFile(sentinel, "keep me");
      const cwd = process.cwd();

      try {
        process.chdir(metaDir);
        await runFilePostProcessing(appendToInput, target);

        expect(await fs.readFile(target, "utf8")).to.equal("ORIGINALX");
        expect(await fs.readFile(sentinel, "utf8")).to.equal("keep me");
      } finally {
        process.chdir(cwd);
        await cleanUp();
      }
    });

    it("passes the file name to {output} hooks verbatim too", async () => {
      const target = await tempFile("a b'c\"d;e.pdf", "ORIGINAL");

      try {
        await runFilePostProcessing(writeOutputTemplate, target);

        expect(await fs.readFile(target, "utf8")).to.equal("HOOKED");
      } finally {
        await cleanUp();
      }
    });
  });

  describe("timeout", () => {
    // The hook outlives the timeout below, so the runner has to kill it.
    const hang = ["node", "-e", "setTimeout(()=>{},600000)", "{input}"];

    const shortTimeout = 1_000;

    it("gives up on a hook that never returns and keeps the original", async () => {
      const dest = path.join(tempDir, "hook-hang.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      // Racing against a timer keeps the test short: with no timeout at all
      // the outcome stays "still waiting" past the kill deadline.
      const outcome = await Promise.race([
        runFilePostProcessing(hang, dest, shortTimeout).then(
          () => "settled",
          () => "rejected",
        ),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("still waiting"), 5_000),
        ),
      ]);

      expect(outcome).to.equal("settled");
      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    }).timeout(20_000);

    it("does not throw when the hook is killed by the timeout", async () => {
      const dest = path.join(tempDir, "hook-hang-nothrow.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      // The documented contract: a failing hook never throws.
      await runFilePostProcessing(hang, dest, shortTimeout).catch(
        () => undefined,
      );

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    }).timeout(20_000);

    it("applies a default timeout so a hook cannot block the scan flow", () => {
      expect(DEFAULT_POST_PROCESSING_TIMEOUT_MS).to.be.a("number");
      expect(DEFAULT_POST_PROCESSING_TIMEOUT_MS).to.be.greaterThan(0);
    });
  });

  describe("timeout configuration", () => {
    it("uses POST_COMMAND_TIMEOUT when it is a positive number", () => {
      expect(resolveTimeout("60000")).to.equal(60_000);
    });

    it("falls back to the default when the variable is absent", () => {
      expect(resolveTimeout(undefined)).to.equal(
        FALLBACK_POST_PROCESSING_TIMEOUT_MS,
      );
    });

    it("falls back to the default on a blank value", () => {
      expect(resolveTimeout("   ")).to.equal(
        FALLBACK_POST_PROCESSING_TIMEOUT_MS,
      );
    });

    it("falls back to the default on a non-numeric value", () => {
      expect(resolveTimeout("not-a-number")).to.equal(
        FALLBACK_POST_PROCESSING_TIMEOUT_MS,
      );
    });

    it("falls back to the default on a non-positive value", () => {
      expect(resolveTimeout("0")).to.equal(FALLBACK_POST_PROCESSING_TIMEOUT_MS);
      expect(resolveTimeout("-5")).to.equal(
        FALLBACK_POST_PROCESSING_TIMEOUT_MS,
      );
    });

    it("leaves enough room for a legitimate conversion", () => {
      expect(FALLBACK_POST_PROCESSING_TIMEOUT_MS).to.be.at.least(60_000);
    });
  });

  describe("atomic replacement", () => {
    it("keeps the original file when the hook leaves a directory as {output}", async () => {
      const dest = path.join(tempDir, "hook-output-dir.pdf");
      // A previous failing run may have left a directory in place of the file.
      await fs.rm(dest, { force: true, recursive: true });
      await fs.writeFile(dest, "ORIGINAL");
      const mkdirOutput = [
        "node",
        "-e",
        "require('fs').mkdirSync(process.argv[1],{recursive:true})",
        "{output}",
      ];

      try {
        await runFilePostProcessing(mkdirOutput, dest);

        // A directory must never take the place of the scanned file.
        expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");

        const leftovers = (await fs.readdir(tempDir)).filter((f) =>
          f.startsWith("hook-output-dir.pdf."),
        );
        expect(leftovers).to.deep.equal([]);
      } finally {
        // The hook created directories next to the destination: clean them up.
        for (const entry of await fs.readdir(tempDir)) {
          if (entry.startsWith("hook-output-dir.pdf")) {
            await fs.rm(path.join(tempDir, entry), {
              force: true,
              recursive: true,
            });
          }
        }
      }
    });

    it("keeps the destination and drops the temporary file when the rename fails", async () => {
      // A non-empty destination directory makes the rename fail with
      // ENOTEMPTY: the destination must survive and the temporary file must
      // not be left next to it.
      const dest = path.join(tempDir, "hook-rename-fail.pdf");
      const destDir = path.dirname(dest);
      await fs.rm(dest, { force: true, recursive: true });
      await fs.mkdir(dest, { recursive: true });
      await fs.writeFile(path.join(dest, "child.txt"), "keep me");

      try {
        await runFilePostProcessing(writeOutputTemplate, dest);

        expect(existsSync(path.join(dest, "child.txt"))).to.be.true;
        const leftovers = (await fs.readdir(destDir)).filter((f) =>
          f.endsWith(".postprocess.tmp"),
        );
        expect(leftovers).to.deep.equal([]);
      } finally {
        await fs.rm(dest, { force: true, recursive: true });
      }
    });

    it("leaves no temporary file behind when the replacement fails", async () => {
      const dest = path.join(tempDir, "hook-leftover.pdf");
      const destDir = path.dirname(dest);
      await fs.writeFile(dest, "ORIGINAL");
      const isRoot = process.getuid?.() === 0;

      if (!isRoot) {
        // A read-only folder makes the rename fail, which is where the
        // temporary file used to be dropped.
        await fs.chmod(destDir, 0o500);
      }

      try {
        await runFilePostProcessing(writeOutputTemplate, dest).catch(
          () => undefined,
        );
      } finally {
        if (!isRoot) {
          await fs.chmod(destDir, 0o700);
        }
      }

      if (!isRoot) {
        const leftovers = (await fs.readdir(destDir)).filter((f) =>
          f.endsWith(".postprocess.tmp"),
        );
        expect(leftovers).to.deep.equal([]);
      }
      await fs.rm(dest, { force: true });
    });
  });

  describe("concurrent runs", () => {
    it("keeps a usable file when the same file is processed concurrently", async () => {
      const dest = path.join(tempDir, "hook-concurrent.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await Promise.all([
        runFilePostProcessing(writeOutputTemplate, dest),
        runFilePostProcessing(writeOutputTemplate, dest),
        runFilePostProcessing(writeOutputTemplate, dest),
      ]);

      expect(await fs.readFile(dest, "utf8")).to.equal("HOOKED");
      await fs.rm(dest, { force: true });
    });

    it("keeps every result when several pages are processed concurrently", async () => {
      const dir = path.join(tempDir, "hook-concurrent-pages");
      await fs.mkdir(dir, { recursive: true });
      const targets = await Promise.all(
        [1, 2, 3].map(async (i) => {
          const target = path.join(dir, `page${i}.pdf`);
          await fs.writeFile(target, "ORIGINAL");
          return target;
        }),
      );

      await Promise.all(
        targets.map((target) =>
          runFilePostProcessing(writeOutputTemplate, target),
        ),
      );

      for (const target of targets) {
        expect(await fs.readFile(target, "utf8")).to.equal("HOOKED");
      }
      await fs.rm(dir, { recursive: true, force: true });
    });
  });

  describe("undefined command", () => {
    it("leaves the file untouched when no command is configured", async () => {
      const dest = path.join(tempDir, "hook-undefined.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await runFilePostProcessing(undefined, dest);

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });

    it("leaves the file untouched when the program is blank", async () => {
      const dest = path.join(tempDir, "hook-blank.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await runFilePostProcessing(["   ", "{input}"], dest);

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });

    it("keeps the original file when the program does not exist", async () => {
      const dest = path.join(tempDir, "hook-missing.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await runFilePostProcessing(
        ["this-program-does-not-exist-42", "{input}"],
        dest,
      );

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });
  });
});
