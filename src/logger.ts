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

// "auto" (default): pretty in a terminal, plain message-only text otherwise.
// The plain mode reproduces the legacy console.log output line-for-line, so
// integrators parsing stdout are NOT broken. Structured JSON is opt-in.
// "pretty": force human-readable output (time/level/module) anywhere.
// "plain":  force plain message-only text anywhere.
// "json":   force JSON lines anywhere.
const logFormat = process.env["LOG_FORMAT"] ?? "auto";
const isPretty = logFormat === "pretty" || (logFormat === "auto" && isCli);
const isPlain = logFormat === "plain" || (logFormat === "auto" && !isCli);
const transport:
  | {
      target: string;
      options: Record<string, unknown>;
    }
  | undefined = isPretty
  ? {
      target: "pino-pretty",
      options: {
        colorize: isCli,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    }
  : isPlain
    ? {
        target: "pino-pretty",
        options: {
          colorize: false,
          singleLine: true,
          ignore: "pid,hostname,time,level,name",
          messageFormat: "{msg}",
        },
      }
    : undefined;

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
  ...(transport !== undefined ? { transport } : {}),
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
