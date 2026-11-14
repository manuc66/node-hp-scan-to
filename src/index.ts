#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import fs from "fs";
import path from "path";
import commitInfo from "./commitInfo.json" with { type: "json" };
import { resolveConfig } from "./config/resolve.js";
import { setupProgram } from "./program.js";
import logger, { getLoggerForFile } from "./logger.js";

// When running from a bundled executable, look for the configuration
// directory next to the binary unless NODE_CONFIG_DIR was explicitly set.
const bundledConfigDir = path.join(path.dirname(process.execPath), "config");
if (
  process.env["NODE_CONFIG_DIR"] === undefined &&
  fs.existsSync(bundledConfigDir)
) {
  process.env["NODE_CONFIG_DIR"] = bundledConfigDir;
}

const { default: config } = await import("config");

async function main() {
  const logger = getLoggerForFile(import.meta.url);
  logger.info(`Running with Git commit ID: ${commitInfo.commitId}`);
  logger.debug({ env: process.env["NODE_ENV"] }, "Environment detected");

  const resolvedConfig = resolveConfig(config.util.toObject());
  resolvedConfig.warnings.forEach((warning) => logger.warn(warning));

  const program = setupProgram(resolvedConfig);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  logger.error(err);
  process.exitCode = 1;
});
