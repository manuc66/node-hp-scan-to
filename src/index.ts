#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import fs from "fs";
import path from "path";
import type { Config } from "config";
import z from "zod";
import commitInfo from "./commitInfo.json" with { type: "json" };
import { configSchema, type FileConfig } from "./type/FileConfig.js";
import { setupProgram } from "./program.js";

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
