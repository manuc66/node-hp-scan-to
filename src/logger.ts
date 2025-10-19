import pino, { Logger } from "pino";
import path from "node:path";

const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname",
    },
  },
});

export function getLoggerForFile(filename: string): Logger {
  const name = path.basename(filename, path.extname(filename)); // e.g. "pathHelper"
  return baseLogger.child({ name });
}

export default baseLogger;
