import pino, { Logger } from "pino";
import path from "node:path";
import isDocker from "is-docker";

const inDocker = isDocker();
const isCli = process.stdout.isTTY && !inDocker;

const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isCli
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

export function getLoggerForFile(filename: string): Logger {
  const name = path.basename(filename, path.extname(filename)); // e.g. "pathHelper"
  return baseLogger.child({ name });
}

export default baseLogger;
