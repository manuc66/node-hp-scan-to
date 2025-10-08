#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import config, { IConfig } from "config";
import * as commitInfo from "./commitInfo.json";
import { configSchema, FileConfig } from "./type/FileConfig";
import { setupProgram } from "./program";
import logger, { getLoggerForFile } from "./logger";

const validateConfig = (config: IConfig) => {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.format();
    throw new Error(
      `Configuration validation error: ${JSON.stringify(errors)}`,
    );
  }
  return result.data;
};

async function main() {
  const logger = getLoggerForFile(__filename);
  logger.info(`Running with Git commit ID: ${commitInfo.commitId}`);
  logger.debug({ env: process.env.NODE_ENV }, "Environment detected");

  const fileConfig: FileConfig = validateConfig(config);

  const program = setupProgram(fileConfig);

  await program.parseAsync(process.argv);
}

main().catch((err) => logger.error(err));
