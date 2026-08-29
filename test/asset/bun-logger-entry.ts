// Compiled by the bun integration test (test/bun-compiled-logger.test.ts)
// into a standalone executable. Verifies that a bun-compiled binary can log
// in pretty mode without crashing.
import { getLoggerForFile } from "../../src/logger.js";

const log = getLoggerForFile(import.meta.url);
log.info("hello from a bun-compiled executable");