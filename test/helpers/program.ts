import { setupProgram as setupResolvedProgram } from "../../src/program.js";
import { resolveConfig } from "../../src/config/resolve.js";
import type { FileConfig } from "../../src/type/FileConfig.js";

/**
 * CLI tests configure the program with a legacy flat configuration. Go through
 * the resolver like `index.ts` does, so they keep exercising the real startup
 * path without repeating the resolution at every call site.
 */
export function setupProgram(config: FileConfig) {
  return setupResolvedProgram(resolveConfig(config));
}
