#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import config, { type IConfig } from "config";
import commitInfo from "./commitInfo.json" with { type: "json" };
import { configSchema, type FileConfig } from "./type/FileConfig.js";
import { setupProgram } from "./program.js";

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
  const fileConfig: FileConfig = validateConfig(config);

  const program = setupProgram(fileConfig);

  await program.parseAsync(process.argv);
}

console.log(`Current commit ID: ${commitInfo.commitId}`);
main().catch((err) => console.log(err));
