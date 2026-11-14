import os from "node:os";
import { z } from "zod";
import { configSchema, type FileConfig } from "../type/FileConfig.js";
import { DuplexAssemblyMode } from "../type/DuplexAssemblyMode.js";
import {
  rawConfigSchema,
  type RawConfig,
  type RawProfile,
  type RawTarget,
} from "./rawSchema.js";
import { DEFAULT_PROFILE, IMPLICIT_PRINTER_ID } from "./constants.js";
import type {
  ResolvedPrinter,
  ResolvedProgramConfig,
  ResolvedTarget,
} from "./types.js";

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

/**
 * Drops the keys a profile explicitly unset with `null`, once the whole
 * inheritance chain has been merged. A later profile can still set the key
 * again: only the final value decides.
 */
function withoutNulls(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null),
  );
}

/** Profile names to merge, root first; `default` is the implicit root. */
function profileChain(
  name: string,
  profiles: Record<string, RawProfile>,
): string[] {
  const chain = [name];
  if (name === DEFAULT_PROFILE) {
    return chain;
  }

  let parent = profiles[name].extends;
  while (parent !== undefined) {
    chain.unshift(parent);
    if (parent === DEFAULT_PROFILE) {
      break;
    }
    parent = profiles[parent].extends;
  }
  return chain;
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
  resolveProfile: (name: string) => FileConfig,
): [ResolvedTarget, ...ResolvedTarget[]] {
  const entries = Object.entries(rawTargets);
  const toResolvedTarget = ([label, target]: [string, RawTarget]) =>
    toTarget(label, target, resolveProfile(target.profile ?? DEFAULT_PROFILE));

  // The schema guarantees at least one entry.
  const [first, ...rest] = entries;
  return [toResolvedTarget(first), ...rest.map(toResolvedTarget)];
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
  const {
    targets: rawTargets,
    defaults: rawDefaults,
    profiles: rawProfiles,
    ...flat
  } = rawConfig;

  // `defaults` is the explicit shared base: it sits above the flat settings so
  // it can override the `config/default.json` shipped with the application.
  const defaults = rawDefaults ?? {};
  const profiles = rawProfiles ?? {};

  // Targets sharing a profile share the same effective configuration object.
  const cache = new Map<string, FileConfig>();
  const resolveProfile = (name: string): FileConfig => {
    const cached = cache.get(name);
    if (cached !== undefined) {
      return cached;
    }

    // `defaults` is the shared base. The implicit `default` profile adds the
    // flat settings below `defaults`; a named profile adds its extends chain
    // on top, and `null` in a profile unsets the value inherited so far.
    const merged: Record<string, unknown> = { ...defaults };
    for (const profileName of profileChain(name, profiles)) {
      if (profileName === DEFAULT_PROFILE) {
        Object.assign(merged, flat, defaults);
        continue;
      }
      const settings = { ...profiles[profileName] };
      delete settings.extends;
      Object.assign(merged, settings);
    }

    const config = parseProfile(withoutNulls(merged));
    cache.set(name, config);
    return config;
  };

  const targets =
    rawTargets === undefined
      ? legacyTargets(resolveProfile(DEFAULT_PROFILE))
      : explicitTargets(rawTargets, resolveProfile);

  const printer: ResolvedPrinter = { id: IMPLICIT_PRINTER_ID, targets };

  return { printers: [printer], warnings: [] };
}
