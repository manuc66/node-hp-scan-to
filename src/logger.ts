import pino, { type Logger } from "pino";
import path from "node:path";
import { fileURLToPath } from "node:url";
import isDocker from "is-docker";

const inDocker = isDocker();
const isCli = process.stdout.isTTY && !inDocker;
const isTest = process.env["NODE_ENV"] === "test";

// -D/--debug takes effect as early as possible (before CLI parsing), so
// startup logs are also emitted at debug level. The preAction hook in
// program.ts additionally honors `debug: true` from the config file.
const debugRequested =
  process.argv.includes("-D") || process.argv.includes("--debug");
const requestedLevel = process.env["LOG_LEVEL"]?.toLowerCase();
const VALID_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];
const defaultLevel = debugRequested
  ? "debug"
  : requestedLevel !== undefined && VALID_LEVELS.includes(requestedLevel)
    ? requestedLevel
    : "info";

// "auto" (default): pretty in a terminal, JSON otherwise (docker/pipe).
// "pretty": force human-readable output even outside of a terminal.
// "json": force JSON output even in a terminal.
const logFormat = process.env["LOG_FORMAT"] ?? "auto";
const usePrettyTransport =
  logFormat === "pretty" || (logFormat !== "json" && isCli);

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
  serializers: {
    // axios Error objects carry the full request config (headers with auth
    // tokens) and the request/response payloads: never serialize those.
    err: (err: unknown) => {
      if (!err) {
        return err;
      }
      const serialized = pino.stdSerializers.err(err as Error);
      const response = (
        err as { response?: { status?: number; statusText?: string } }
      ).response;
      if (response !== undefined) {
        serialized["response"] = {
          status: response.status,
          statusText: response.statusText,
        };
      }
      delete serialized["config"];
      delete serialized["request"];
      return serialized;
    },
  },
  ...(usePrettyTransport
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: isCli,
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
