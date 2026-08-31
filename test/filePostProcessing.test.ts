import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import { createPdfFrom } from "../src/pdfProcessing.js";
import type { ScanPage } from "../src/type/ScanContent.js";
import path from "node:path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const writeOutputTemplate =
  'node -e "require(\'fs\').writeFileSync(process.argv[1],\'HOOKED\')" "{output}"';
const copyTemplate =
  'node -e "require(\'fs\').copyFileSync(process.argv[1],process.argv[2])" "{input}" "{output}"';
const appendTemplate =
  'node -e "require(\'fs\').appendFileSync(process.argv[1],\'X\')" "{input}"';
const exitTemplate = 'node -e "process.exit(3)" "{input}"';
const emptyOutputTemplate = 'node -e "" "{output}"';

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

  it("does nothing for an empty template", async () => {
    const dest = path.join(tempDir, "hook-empty.pdf");
    await createPdfFrom({ elements: [makePage()] }, dest, undefined, "");
    expect(existsSync(dest)).to.be.true;
    expect(await fs.readFile(dest, "utf8")).to.include("%PDF");
    await fs.unlink(dest);
  });
});