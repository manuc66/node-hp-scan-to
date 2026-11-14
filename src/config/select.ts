import { DuplexAssemblyMode } from "../type/DuplexAssemblyMode.js";
import type { FileConfig } from "../type/FileConfig.js";
import type { RegistrationConfig } from "../type/scanTargetDefinitions.js";
import type { ResolvedPrinter, ResolvedTarget } from "./types.js";

/** A label to register on the device, with the pipeline it scans with. */
export interface ListenTarget {
  registration: RegistrationConfig;
  config: FileConfig;
}

/**
 * The `listen` flags that used to describe the only registration. They are
 * only meaningful while the file declares no explicit `targets`, where the
 * label and the emulated-duplex registration are part of the configuration.
 */
export interface ListenRegistrationOptions {
  label: string | undefined;
  addEmulatedDuplex: true | DuplexAssemblyMode | undefined;
  emulatedDuplexLabel: string | undefined;
}

function toListenTarget(target: ResolvedTarget): ListenTarget {
  return {
    registration: {
      label: target.label,
      isDuplexSingleSide: target.isDuplexSingleSide,
      ...(target.duplexAssemblyMode !== undefined && {
        duplexAssemblyMode: target.duplexAssemblyMode,
      }),
    },
    config: target.config,
  };
}

function asNonEmpty<T>(targets: T[]): [T, ...T[]] {
  const [first, ...rest] = targets;
  return [first, ...rest];
}

/**
 * Builds the registrations `listen` has to create on the device.
 *
 * An explicit `targets` block is authoritative: the configuration describes
 * every label, so the historical `--label` / `--add-emulated-duplex` flags are
 * rejected instead of silently duplicating or renaming a registration.
 * Otherwise the resolved legacy targets are adjusted with those flags, with
 * the same naming and defaults as before.
 */
export function buildListenTargets(
  printer: ResolvedPrinter,
  options: ListenRegistrationOptions,
): [ListenTarget, ...ListenTarget[]] {
  if (printer.explicitTargets) {
    if (
      options.label !== undefined ||
      options.addEmulatedDuplex !== undefined ||
      options.emulatedDuplexLabel !== undefined
    ) {
      throw new Error(
        "--label, --add-emulated-duplex and --emulated-duplex-label cannot be used when the configuration declares targets: each target key is a label",
      );
    }
    return asNonEmpty(printer.targets.map(toListenTarget));
  }

  const base = printer.targets[0];
  const config = base.config;
  const label = options.label ?? base.label;

  // A bare `--add-emulated-duplex` used to force the document-wise order, even
  // when the file configured another one; keep that exact precedence.
  const cliAssemblyMode =
    options.addEmulatedDuplex === undefined
      ? undefined
      : options.addEmulatedDuplex === true
        ? DuplexAssemblyMode.DOCUMENT_WISE
        : options.addEmulatedDuplex;

  const targets: ResolvedTarget[] = [
    { label, isDuplexSingleSide: false, config },
  ];

  if (cliAssemblyMode !== undefined || config.add_emulated_duplex === true) {
    targets.push({
      label:
        options.emulatedDuplexLabel ??
        config.emulated_duplex_label ??
        `${label} duplex`,
      isDuplexSingleSide: true,
      duplexAssemblyMode:
        cliAssemblyMode ??
        config.emulated_duplex_assembly_mode ??
        DuplexAssemblyMode.DOCUMENT_WISE,
      config,
    });
  }

  return asNonEmpty(targets.map(toListenTarget));
}

/**
 * The single pipeline a `single-scan` or `adf-autoscan` run must use.
 *
 * Those commands do not register labels, so they cannot pick a target by
 * itself. Until a selector exists, refuse to guess when several are configured
 * rather than silently scanning with the first one.
 */
export function selectSingleTarget(printer: ResolvedPrinter): ResolvedTarget {
  if (printer.targets.length === 1) {
    return printer.targets[0];
  }

  const labels = printer.targets.map((target) => target.label).join(", ");
  throw new Error(
    `several scan targets are configured (${labels}); selecting one is not supported yet`,
  );
}
