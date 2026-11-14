import os from "node:os";
import { z } from "zod";
import { configSchema, type FileConfig } from "../type/FileConfig.js";
import { DuplexAssemblyMode } from "../type/DuplexAssemblyMode.js";
import {
  rawConfigSchema,
  type RawConfig,
  type RawTarget,
} from "./rawSchema.js";
import type {
  ResolvedPrinter,
  ResolvedProgramConfig,
  ResolvedTarget,
} from "./types.js";

/** Identifier of the printer described by a flat configuration file. */
export const IMPLICIT_PRINTER_ID = "default";

function configurationError(error: z.ZodError): Error {
  return new Error(`Configuration validation error: ${z.prettifyError(error)}`);
}

/**
 * Validates the on-disk file: its shape, the target labels and the keys that
 * cannot be combined. Cross-field rules on the scan settings run later, on the
 * resolved profile, because a profile may legitimately be partial.
 */
function parseRawConfig(raw: unknown): RawConfig {
  const result = rawConfigSchema.safeParse(raw);
  if (!result.success) {
    throw configurationError(result.error);
  }
  return result.data;
}

/** Validates one effective profile with the historical schema. */
function parseProfile(input: unknown): FileConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    throw configurationError(result.error);
  }
  return result.data;
}

function toTarget(
  label: string,
  target: RawTarget,
  config: FileConfig,
): ResolvedTarget {
  if (target.duplex === "emulated") {
    return {
      label,
      isDuplexSingleSide: true,
      duplexAssemblyMode:
        target.assembly_mode ?? DuplexAssemblyMode.DOCUMENT_WISE,
      config,
    };
  }
  return { label, isDuplexSingleSide: false, config };
}

function explicitTargets(
  rawTargets: Record<string, RawTarget>,
  config: FileConfig,
): [ResolvedTarget, ...ResolvedTarget[]] {
  const entries = Object.entries(rawTargets);
  // The schema guarantees at least one entry.
  const [firstLabel, firstTarget] = entries[0];
  const rest = entries
    .slice(1)
    .map(([label, target]) => toTarget(label, target, config));
  return [toTarget(firstLabel, firstTarget, config), ...rest];
}

/**
 * The legacy `listen` behaviour: one label, plus an optional emulated-duplex
 * label whose name and assembly mode keep their historical defaults.
 */
function legacyTargets(
  config: FileConfig,
): [ResolvedTarget, ...ResolvedTarget[]] {
  const label = config.label ?? os.hostname();

  const targets: [ResolvedTarget, ...ResolvedTarget[]] = [
    { label, isDuplexSingleSide: false, config },
  ];

  if (config.add_emulated_duplex === true) {
    targets.push({
      label: config.emulated_duplex_label ?? `${label} duplex`,
      isDuplexSingleSide: true,
      duplexAssemblyMode:
        config.emulated_duplex_assembly_mode ??
        DuplexAssemblyMode.DOCUMENT_WISE,
      config,
    });
  }

  return targets;
}

/**
 * Normalises the configuration file into the shape the runtime consumes: one
 * entry per printer, one entry per label registered on it.
 *
 * Today a single implicit printer is supported, either described by the legacy
 * flat keys or by a `targets` block on top of them. The `profiles` / `printers`
 * layouts will be resolved here as well, keeping `program.ts` and the scan
 * pipeline unaware of the on-disk format.
 */
export function resolveConfig(raw: unknown): ResolvedProgramConfig {
  const rawConfig = parseRawConfig(raw);
  const { targets: rawTargets, defaults: rawDefaults, ...flat } = rawConfig;

  // `defaults` is the explicit shared base: it sits above the flat settings so
  // it can override the `config/default.json` shipped with the application.
  const config = parseProfile({ ...flat, ...(rawDefaults ?? {}) });

  const targets =
    rawTargets === undefined
      ? legacyTargets(config)
      : explicitTargets(rawTargets, config);

  const printer: ResolvedPrinter = { id: IMPLICIT_PRINTER_ID, targets };

  return { printers: [printer], warnings: [] };
}
