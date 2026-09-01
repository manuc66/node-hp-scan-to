// Spawned by test/loggerOutput.test.ts under different LOG_FORMAT/LOG_LEVEL
// combinations to verify the real rendered output of the logger.
import { getLoggerForFile } from "../../src/logger.js";

const log = getLoggerForFile(import.meta.url);
log.info("info message");
log.warn("warn message");
log.debug("debug message");
log.info(
  { token: "secret-token", nested: { password: "secret-password" } },
  "with secrets",
);

// give async transports (pino worker under pretty mode) time to flush
setTimeout(() => {}, 500);
