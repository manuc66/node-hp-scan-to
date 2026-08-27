import pino, { type Logger } from "pino";
import path from "node:path";
import { fileURLToPath } from "node:url";
import isDocker from "is-docker";

const inDocker = isDocker();
const isCli = process.stdout.isTTY && !inDocker;
const isTest = process.env["NODE_ENV"] === "test";

const defaultLevel = process.env["LOG_LEVEL"] ?? "info";

const baseLogger: Logger = pino({
  enabled: !isTest,
  level: defaultLevel,
  redact: {
    paths: [
      "password",
      "*.password",
      "authToken",
      "*.authToken",
      "token",
      "*.token",
      "Authorization",
      "headers.Authorization",
      "*.headers.Authorization",
    ],
    censor: "[Redacted]",
  },
  ...(isCli
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export function setDebugLevel(isDebug: boolean): void {
  baseLogger.level = isDebug ? "debug" : defaultLevel;
}

export function getLoggerForFile(importMetaUrl: string): Logger {
  const filename = fileURLToPath(importMetaUrl);
  const name = path.basename(filename, path.extname(filename)); // e.g. "pathHelper"
  return baseLogger.child({ name });
}

export default baseLogger;
