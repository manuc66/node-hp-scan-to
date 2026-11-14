import type { DuplexAssemblyMode } from "../type/DuplexAssemblyMode.js";
import type { FileConfig } from "../type/FileConfig.js";

/**
 * A label registered on a printer, together with the pipeline that scans when
 * the user selects it.
 *
 * `config` has the same shape as the historical flat configuration file
 * (`FileConfig`), so everything downstream (scan settings, output directory,
 * delivery integrations, post-processing) keeps consuming the type it already
 * knows. The multi-printer layouts are normalised into this shape by
 * `resolveConfig`, which is the only place that knows about them.
 */
export interface ResolvedTarget {
  label: string;
  isDuplexSingleSide: boolean;
  duplexAssemblyMode?: DuplexAssemblyMode;
  config: FileConfig;
}

/** One physical printer and the labels registered on it (at least one). */
export interface ResolvedPrinter {
  id: string;
  /** True when the file declared its own `targets` block. */
  explicitTargets: boolean;
  targets: [ResolvedTarget, ...ResolvedTarget[]];
}

/** The whole configuration file, normalised for the runtime. */
export interface ResolvedProgramConfig {
  printers: [ResolvedPrinter, ...ResolvedPrinter[]];
  /** Non-fatal configuration remarks, logged once at startup. */
  warnings: string[];
}
