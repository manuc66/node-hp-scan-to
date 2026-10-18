import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import { createPdfFrom } from "../src/pdfProcessing.js";
import {
  DEFAULT_POST_PROCESSING_TIMEOUT_MS,
  FALLBACK_POST_PROCESSING_TIMEOUT_MS,
  resolveTimeout,
  runFilePostProcessing,
} from "../src/filePostProcessing.js";
import { MAX_POST_PROCESSING_TIMEOUT_MS } from "../src/postCommand.js";
import type { ScanPage } from "../src/type/ScanContent.js";
import path from "node:path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync, lstatSync } from "node:fs";

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

    it("does not turn a timeout larger than a timer can honour into an immediate kill", async () => {
      const dest = path.join(tempDir, "hook-huge-timeout.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      // Number.isInteger(1e30) is true, so a value like this reaches the
      // runner from the CLI, the config file or the environment. Handed to
      // setTimeout as-is, Node clamps it to 1 ms and kills the hook the moment
      // it starts; it must mean "let the hook run" instead.
      await runFilePostProcessing(appendTemplate, dest, 1e30);
      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINALX");

      // Infinity is the same trap for a bound computed in code.
      await fs.writeFile(dest, "ORIGINAL");
      await runFilePostProcessing(
        appendTemplate,
        dest,
        Number.POSITIVE_INFINITY,
      );
      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINALX");

      await fs.rm(dest, { force: true });
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

    it("accepts the largest timeout a timer can honour", () => {
      // 2^31-1 ms is the longest delay setTimeout does not rewrite.
      expect(MAX_POST_PROCESSING_TIMEOUT_MS).to.equal(2_147_483_647);
      expect(resolveTimeout("2147483647")).to.equal(2_147_483_647);
    });

    it("falls back to the default on a value larger than a timer can honour", () => {
      // Beyond 2^31-1 ms Node does not honour the delay, it warns and rewrites
      // it to 1 ms: the value is unusable, exactly like a blank one.
      expect(resolveTimeout("2147483648")).to.equal(
        FALLBACK_POST_PROCESSING_TIMEOUT_MS,
      );
      expect(resolveTimeout("1e30")).to.equal(
        FALLBACK_POST_PROCESSING_TIMEOUT_MS,
      );
    });

    it("falls back to the default on a fractional value a timer would truncate", () => {
      expect(resolveTimeout("1000.5")).to.equal(
        FALLBACK_POST_PROCESSING_TIMEOUT_MS,
      );
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

  describe("a hook that leaves nothing usable behind", () => {
    // The runner promises that a failing hook can never lose the scan. A tool
    // that stops halfway must therefore not be able to replace it with
    // something the delivery stage cannot use: a symbolic link (which is not
    // the file the hook was asked to write) or an empty file.
    const isWindows = process.platform === "win32";
    const ifSymlinksAllowed = isWindows ? it.skip : it;

    it("keeps the original when the {output} file is empty", async () => {
      const dest = path.join(tempDir, "hook-empty-output.pdf");
      await fs.writeFile(dest, "ORIGINAL");
      const emptyOutput = [
        "node",
        "-e",
        "require('fs').writeFileSync(process.argv[1],'')",
        "{output}",
      ];

      await runFilePostProcessing(emptyOutput, dest);

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });

    it("restores the original when an in-place hook empties the file", async () => {
      const dest = path.join(tempDir, "hook-truncated.pdf");
      await fs.writeFile(dest, "ORIGINAL");
      const emptyInPlace = [
        "node",
        "-e",
        "require('fs').writeFileSync(process.argv[1],'')",
        "{input}",
      ];

      await runFilePostProcessing(emptyInPlace, dest);

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });

    ifSymlinksAllowed(
      "keeps the original when the hook links {output} elsewhere",
      async () => {
        const dir = path.join(tempDir, "hook-output-symlink");
        await fs.rm(dir, { recursive: true, force: true });
        await fs.mkdir(dir, { recursive: true });
        const dest = path.join(dir, "scan.pdf");
        const elsewhere = path.join(dir, "elsewhere.pdf");
        await fs.writeFile(dest, "ORIGINAL");
        await fs.writeFile(elsewhere, "NOT THE SCAN");

        // `gs` and friends are not the only tools that can leave a link: any
        // hook writing through one produces it.
        const linkOutput = [
          "node",
          "-e",
          "require('fs').symlinkSync(process.argv[2],process.argv[1])",
          "{output}",
          elsewhere,
        ];

        try {
          await runFilePostProcessing(linkOutput, dest);

          expect(lstatSync(dest).isSymbolicLink()).to.be.false;
          expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
        } finally {
          await fs.rm(dir, { recursive: true, force: true });
        }
      },
    );

    ifSymlinksAllowed(
      "restores the original when an in-place hook links the file elsewhere",
      async () => {
        const dir = path.join(tempDir, "hook-in-place-symlink");
        await fs.rm(dir, { recursive: true, force: true });
        await fs.mkdir(dir, { recursive: true });
        const dest = path.join(dir, "scan.pdf");
        const elsewhere = path.join(dir, "elsewhere.pdf");
        await fs.writeFile(dest, "ORIGINAL");
        await fs.writeFile(elsewhere, "NOT THE SCAN");

        const linkInPlace = [
          "node",
          "-e",
          "const fs=require('fs');fs.unlinkSync(process.argv[1]);" +
            "fs.symlinkSync(process.argv[2],process.argv[1]);",
          "{input}",
          elsewhere,
        ];

        try {
          await runFilePostProcessing(linkInPlace, dest);

          expect(lstatSync(dest).isSymbolicLink()).to.be.false;
          expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
        } finally {
          await fs.rm(dir, { recursive: true, force: true });
        }
      },
    );
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

  describe("a hook that writes a lot to stdout", () => {
    // stdout is spawned as a pipe but never read by the runner. A hook that
    // writes more than the OS pipe buffer (64 KB on Linux) blocks forever
    // waiting for the pipe to drain, never closes, and is only stopped by
    // the timeout — the hook then fails and its output is discarded. The
    // runner has to drain stdout for the hook to be able to finish.
    const stdoutHeavyTemplate = [
      "node",
      "-e",
      "const fs=require('fs');" +
        "process.stdout.write('x'.repeat(300000));" +
        "fs.writeFileSync(process.argv[1],'HOOKED')",
      "{output}",
    ];

    it("lets the hook complete instead of killing it at the timeout", async () => {
      const dest = path.join(tempDir, "hook-stdout.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await runFilePostProcessing(stdoutHeavyTemplate, dest, 2_000);

      expect(await fs.readFile(dest, "utf8")).to.equal("HOOKED");
      await fs.rm(dest, { force: true });
    }).timeout(20_000);
  });

  describe("an in-place command that fails after modifying the file", () => {
    // Without {output} there is no atomic swap: a tool can truncate or
    // half-write the file before it fails. The runner has to keep a copy of
    // the original and put it back, otherwise the scan is lost while the log
    // claims the original was kept.
    const truncateThenFail = [
      "node",
      "-e",
      "require('fs').writeFileSync(process.argv[1],'PARTIAL');process.exit(4)",
      "{input}",
    ];
    const deleteThenFail = [
      "node",
      "-e",
      "require('fs').rmSync(process.argv[1]);process.exit(4)",
      "{input}",
    ];
    const deleteThenSucceed = [
      "node",
      "-e",
      "require('fs').rmSync(process.argv[1])",
      "{input}",
    ];

    it("restores the original content when the command truncated it", async () => {
      const dest = path.join(tempDir, "hook-inplace-truncated.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await runFilePostProcessing(truncateThenFail, dest);

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });

    it("restores the original when the command deleted it before failing", async () => {
      const dest = path.join(tempDir, "hook-inplace-deleted.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await runFilePostProcessing(deleteThenFail, dest);

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });

    it("restores the original when the command exits 0 but leaves no file", async () => {
      const dest = path.join(tempDir, "hook-inplace-removed.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await runFilePostProcessing(deleteThenSucceed, dest);

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });

    it("restores the original when the command left a directory in its place", async () => {
      const dest = path.join(tempDir, "hook-inplace-dir.pdf");
      await fs.writeFile(dest, "ORIGINAL");
      const directoryThenFail = [
        "node",
        "-e",
        "const fs=require('fs');" +
          "fs.rmSync(process.argv[1],{force:true});" +
          "fs.mkdirSync(process.argv[1]);" +
          "process.exit(4)",
        "{input}",
      ];

      await runFilePostProcessing(directoryThenFail, dest);

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dest, { force: true });
    });

    it("leaves no backup file behind", async () => {
      const dest = path.join(tempDir, "hook-inplace-leftover.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      await runFilePostProcessing(truncateThenFail, dest);

      const leftovers = (await fs.readdir(path.dirname(dest))).filter((f) =>
        f.endsWith(".postprocess.bak"),
      );
      expect(leftovers).to.deep.equal([]);
      await fs.rm(dest, { force: true });
    });

    it("skips the command when the original cannot be backed up", async () => {
      const dir = path.join(tempDir, "hook-nobackup");
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });
      const dest = path.join(dir, "scan.pdf");
      await fs.writeFile(dest, "ORIGINAL");
      const marker = path.join(tempDir, "hook-nobackup-ran.txt");
      await fs.rm(marker, { force: true });
      // A read-only folder makes the safety copy fail: the hook must not run
      // on a file the runner cannot protect.
      const isRoot = process.getuid?.() === 0;
      const appendAndMark = [
        "node",
        "-e",
        "const fs=require('fs');" +
          "fs.appendFileSync(process.argv[1],'X');" +
          "fs.writeFileSync(process.argv[2],'ran')",
        "{input}",
        marker,
      ];

      if (!isRoot) {
        await fs.chmod(dir, 0o500);
      }
      try {
        await runFilePostProcessing(appendAndMark, dest);
      } finally {
        if (!isRoot) {
          await fs.chmod(dir, 0o700);
        }
      }

      if (!isRoot) {
        expect(existsSync(marker)).to.be.false;
      }
      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dir, { recursive: true, force: true });
    });
  });

  describe("timeout on a command that starts its own process", () => {
    // A hook often delegates to a converter. Killing only the direct child
    // leaves that converter running, and it may keep writing after the runner
    // discarded its work. The whole process tree has to be killed.
    it("kills the process the hook started, not just the hook", async function () {
      this.timeout(20_000);
      const dir = path.join(tempDir, "hook-tree");
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });

      const dest = path.join(dir, "scan.pdf");
      await fs.writeFile(dest, "ORIGINAL");
      const leakPath = path.join(dir, "leaked.txt");
      const grandchild = path.join(dir, "grandchild.cjs");
      const hookFile = path.join(dir, "hook.cjs");

      // The grandchild writes well after the timeout; the hook hangs so the
      // runner has to kill it.
      // `node script.js a b` puts the script path in argv[1], so the hook is
      // run as `node hook.cjs {input} <leakPath> <grandchild>`: argv[3] is the
      // leak path, argv[4] the grandchild script.
      await fs.writeFile(
        grandchild,
        "setTimeout(()=>require('fs').writeFileSync(process.argv[2],'leak'),1500)",
      );
      await fs.writeFile(
        hookFile,
        "const {spawn}=require('child_process');" +
          "spawn(process.execPath,[process.argv[4],process.argv[3]],{stdio:'ignore'}).unref();" +
          "setTimeout(()=>{},600000);",
      );

      await runFilePostProcessing(
        ["node", hookFile, "{input}", leakPath, grandchild],
        dest,
        800,
      );

      // Wait past the moment the grandchild would have written its file.
      await new Promise((resolve) => setTimeout(resolve, 2_500));

      expect(existsSync(leakPath)).to.be.false;
      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dir, { recursive: true, force: true });
    });
  });

  describe("a temporary file the runner cannot clean up", () => {
    // The hook contract is that post-processing never fails the scan flow.
    // Dropping the temporary file is housekeeping: when the filesystem refuses
    // it, the error must not escape and fail the whole scan job.
    it("never throws and keeps the original file", async () => {
      const dir = path.join(tempDir, "hook-undiscardable");
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });
      const dest = path.join(dir, "scan.pdf");
      await fs.writeFile(dest, "ORIGINAL");

      const isRoot = process.getuid?.() === 0;
      // Leaves a directory at {output} and makes its folder read-only, so the
      // runner cannot remove that temporary entry afterwards.
      const makeUndiscardable = [
        "node",
        "-e",
        "const fs=require('fs');const path=require('path');" +
          "fs.mkdirSync(process.argv[1],{recursive:true});" +
          "fs.chmodSync(path.dirname(process.argv[1]),0o500);",
        "{output}",
      ];

      try {
        await runFilePostProcessing(makeUndiscardable, dest);
      } finally {
        if (!isRoot) {
          await fs.chmod(dir, 0o700);
        }
      }

      expect(await fs.readFile(dest, "utf8")).to.equal("ORIGINAL");
      await fs.rm(dir, { recursive: true, force: true });
    });
  });
});
