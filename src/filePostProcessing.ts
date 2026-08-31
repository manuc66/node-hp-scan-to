import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

/**
 * Runs an optional external command over a generated scan file.
 *
 * The template is a shell command string supporting two placeholders:
 * - `{input}` the absolute path of the generated file
 * - `{output}` an absolute temporary file path; when the template uses it,
 *   the resulting file atomically replaces the original file after a
 *   successful run.
 *
 * When the template does not use `{output}`, the command is expected to
 * modify the file in place.
 *
 * A failure never throws: the original file is kept and the error is logged,
 * so the post-processing hook stays an optional escape hatch.
 */
export async function runFilePostProcessing(
  template: string,
  filePath: string,
): Promise<void> {
  if (template.trim() === "") {
    return;
  }

  const outputPath = template.includes("{output}")
    ? path.join(
        path.dirname(filePath),
        `${path.basename(filePath)}.${process.pid}.${Date.now()}.postprocess.tmp`,
      )
    : undefined;

  const command = template
    .replaceAll("{input}", filePath)
    .replaceAll("{output}", outputPath ?? "");

  const exitCode = await runShellCommand(command);
  if (exitCode !== 0) {
    logger.error(
      { exitCode, command: template },
      `Post-processing command failed, keeping the original file: ${filePath}`,
    );
    await discardTempFile(outputPath);
    return;
  }

  if (outputPath !== undefined) {
    await replaceFileWithOutput(outputPath, filePath, template);
    return;
  }

  try {
    await fs.access(filePath);
    logger.info(`Post-processing applied to ${filePath}`);
  } catch {
    logger.error(
      { command: template },
      `Post-processing command did not leave the file at ${filePath}, keeping the original file`,
    );
  }
}

function runShellCommand(command: string): Promise<number> {
  return new Promise((resolve) => {
    exec(
      command,
      { maxBuffer: 10 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error === null) {
          logger.debug(`Post-processing command succeeded: ${command}`);
          resolve(0);
          return;
        }
        const exitCode = typeof error.code === "number" ? error.code : -1;
        logger.error(
          { exitCode, stderr: stderr.slice(0, 2000) },
          "Post-processing command reported a failure",
        );
        resolve(exitCode);
      },
    );
  });
}

async function replaceFileWithOutput(
  outputPath: string,
  filePath: string,
  template: string,
): Promise<void> {
  if (!(await isExistingFile(outputPath))) {
    logger.error(
      { command: template },
      `Post-processing command produced no {output} file, keeping the original file: ${filePath}`,
    );
    return;
  }
  try {
    await fs.rename(outputPath, filePath);
  } catch {
    await fs.rm(filePath, { force: true });
    await fs.rename(outputPath, filePath);
  }
  logger.info(`Post-processing applied to ${filePath}`);
}

async function isExistingFile(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function discardTempFile(outputPath: string | undefined): Promise<void> {
  if (outputPath !== undefined) {
    await fs.rm(outputPath, { force: true });
  }
}