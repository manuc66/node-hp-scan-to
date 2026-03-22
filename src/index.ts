#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import config, { type Config } from "config";
import z from "zod";
import commitInfo from "./commitInfo.json" with { type: "json" };
import { configSchema, type FileConfig } from "./type/FileConfig.js";
import { setupProgram } from "./program.js";

const validateConfig = (config: Config) => {
  const result = configSchema.safeParse(config.util.toObject());
  if (!result.success) {
    const errors = z.prettifyError(result.error);
    throw new Error(`Configuration validation error: ${errors}`);
  }
  return result.data;
};

async function main() {
  const fileConfig: FileConfig = validateConfig(config);

  const program = setupProgram(fileConfig);

  await program.parseAsync(process.argv);
}

console.log(`Running with Git commit ID: ${commitInfo.commitId}`);
main().catch((err) => console.log(err));
