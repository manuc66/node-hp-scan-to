import os from "node:os";
import { z } from "zod";
import { configSchema, type FileConfig } from "../type/FileConfig.js";
import { DuplexAssemblyMode } from "../type/DuplexAssemblyMode.js";
import type {
  ResolvedPrinter,
  ResolvedProgramConfig,
  ResolvedTarget,
} from "./types.js";

/** Identifier of the printer described by a legacy flat configuration file. */
export const IMPLICIT_PRINTER_ID = "default";

/**
 * Validates the raw configuration file with the historical schema.
 *
 * The message is kept identical to the one `index.ts` used to build, so a
 * misconfigured file fails the same way it always did.
 */
function parseConfig(raw: unknown): FileConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Configuration validation error: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/**
 * Normalises the configuration file into the shape the runtime consumes: one
 * entry per printer, one entry per label registered on it.
 *
 * Today only the legacy flat layout exists, so this always yields a single
 * implicit printer whose targets reuse the same effective configuration. The
 * `profiles` / `printers` layouts will be resolved here as well, keeping
 * `program.ts` and the scan pipeline unaware of the on-disk format.
 */
export function resolveConfig(raw: unknown): ResolvedProgramConfig {
  const config = parseConfig(raw);
  const label = config.label ?? os.hostname();

  const targets: [ResolvedTarget, ...ResolvedTarget[]] = [
    { label, isDuplexSingleSide: false, config },
  ];

  // Legacy `listen` registers a second label for emulated duplex; keep the
  // exact same naming and defaults so the printer screen does not change.
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

  const printer: ResolvedPrinter = { id: IMPLICIT_PRINTER_ID, targets };

  return { printers: [printer], warnings: [] };
}
