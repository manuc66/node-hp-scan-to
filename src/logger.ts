import pino, { type Logger } from "pino";
import path from "node:path";
import { fileURLToPath } from "node:url";
import isDocker from "is-docker";
import pinoPretty from "pino-pretty";

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

const LEVEL_LABELS: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

const SAFE_ERROR_KEYS = new Set([
  "type",
  "message",
  "stack",
  "name",
  "code",
  "status",
  "errno",
  "syscall",
  "address",
  "port",
  "isAxiosError",
]);

// axios Error objects carry the full request config (headers with auth
// tokens) and the request/response payloads: never serialize those.
export function serializeError(err: unknown): unknown {
  if (!err) {
    return err;
  }
  const serialized = pino.stdSerializers.err(err as Error);
  const response = (
    err as { response?: { status?: number; statusText?: string } }
  ).response;
  const cause = (err as { cause?: unknown }).cause;
  const safe: Record<string, unknown> = {};
  for (const key of SAFE_ERROR_KEYS) {
    if (serialized[key] !== undefined) {
      safe[key] = serialized[key];
    }
  }
  // Copy custom sensitive fields (like password) for redaction
  if ((err as { password?: unknown }).password !== undefined) {
    safe["password"] = "[Redacted]";
  }
  if (response !== undefined) {
    safe["response"] = {
      status: response.status,
      statusText: response.statusText,
    };
  }
  if (cause !== undefined) {
    safe["cause"] = serializeError(cause);
  }
  return safe;
}

// Keeps legacy bare info/debug lines and prefixes warn/error/fatal so
// humans can tell severity apart.
export function formatPlainLogMessage(
  log: Record<string, unknown>,
  messageKey: string,
): string {
  const msg = log[messageKey] as string;
  const levelLabel = LEVEL_LABELS[log["level"] as number] ?? "info";
  return levelLabel === "info" || levelLabel === "debug"
    ? msg
    : `${levelLabel.toUpperCase()}: ${msg}`;
}

const loggerOptions = {
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
      "authorization",
      "headers.Authorization",
      "headers.authorization",
      "*.headers.Authorization",
      "*.headers.authorization",
      "secretAccessKey",
      "*.secretAccessKey",
      "accessKeyId",
      "*.accessKeyId",
      "sessionToken",
      "*.sessionToken",
      "x-amz-security-token",
      "*.x-amz-security-token",
    ],
    censor: "[Redacted]",
  },
  serializers: {
    err: (err: unknown) => serializeError(err),
  },
};

// Bun-compiled executables bundle every module, so a pino worker-thread
// transport cannot resolve its "pino-pretty" target at runtime. Run
// pino-pretty in-process there (the messageFormat below cannot cross a
// worker boundary anyway). Node.js keeps the worker transport.
// process.isBun is only defined under Bun, so it is not part of @types/node.
const isBun = (process as { isBun?: boolean }).isBun === true;

export function shouldUseInProcessPinoPretty(
  isPlain: boolean,
  isPretty: boolean,
  isBun: boolean,
): boolean {
  return isPlain || (isPretty && isBun);
}

const prettyOptions = isPlain
  ? {
      colorize: false,
      singleLine: true,
      ignore: "pid,hostname,time,level,name",
      messageFormat: formatPlainLogMessage,
    }
  : {
      colorize: isCli,
      singleLine: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname",
    };

const baseLogger: Logger = shouldUseInProcessPinoPretty(isPlain, isPretty, isBun)
  ? pino(loggerOptions, pinoPretty(prettyOptions))
  : pino({
      ...loggerOptions,
      ...(isPretty
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
