import { z } from "zod";
import { configSchema } from "../type/FileConfig.js";
import { DuplexAssemblyMode } from "../type/DuplexAssemblyMode.js";
import { PROFILE_KEYS, PRINTER_KEYS } from "./keys.js";
import { DEFAULT_PROFILE } from "./constants.js";

/**
 * Keys that only describe the legacy emulated-duplex registration. Once the
 * file declares explicit `targets`, the registration is spelled out there, so
 * silently combining both would make it unclear which label gets registered.
 */
const LEGACY_DUPLEX_KEYS = [
  "add_emulated_duplex",
  "emulated_duplex_label",
  "emulated_duplex_assembly_mode",
] as const;

/** Registration keys that belong to a target, never to a printer entry. */
const REGISTRATION_KEYS = new Set<string>(["label", ...LEGACY_DUPLEX_KEYS]);

const targetSchema = z
  .strictObject({
    // Only emulated duplex is a registration choice; a real duplex scan is
    // decided by the device (or `single_scan_duplex` / `autoscan_duplex`).
    duplex: z.literal("emulated").optional(),
    assembly_mode: z.enum(Object.values(DuplexAssemblyMode)).optional(),
    /** Pipeline used by this target; the implicit default profile when omitted. */
    profile: z.string().min(1).optional(),
  })
  .superRefine((target, ctx) => {
    if (target.assembly_mode !== undefined && target.duplex !== "emulated") {
      ctx.addIssue({
        code: "custom",
        path: ["assembly_mode"],
        message:
          'assembly_mode is only meaningful with duplex: "emulated" on the same target',
      });
    }
  });

const targetsSchema = z
  .record(z.string().min(1), targetSchema)
  .refine((targets) => Object.keys(targets).length > 0, {
    message: "targets must declare at least one target",
  });

// `targets` is required on a printer entry. A dedicated schema gives a useful
// message instead of Zod's generic "expected record, received undefined".
const requiredTargetsSchema = z
  .custom((value) => value !== undefined, {
    message: "a printer requires a targets block (the labels to register)",
  })
  .pipe(targetsSchema);

// Device-level keys accepted inside a `printers.<id>` entry. The legacy
// registration keys (`label`, `add_emulated_duplex`, ...) are excluded: there,
// the target names are the labels.
const PRINTER_DEVICE_KEYS = [
  "ip",
  "name",
  "prefer_escl",
  "deviceUpPollingInterval",
  "autoscan_pollingInterval",
  "autoscan_startScanDelay",
] as const;

const printerSettingsSchema = z.strictObject(
  Object.fromEntries(
    PRINTER_DEVICE_KEYS.map((key) => [key, configSchema.shape[key]]),
  ) as Pick<typeof configSchema.shape, (typeof PRINTER_DEVICE_KEYS)[number]>,
);

const printerSchema = z
  .strictObject({
    ...printerSettingsSchema.shape,
    targets: requiredTargetsSchema,
  })
  .superRefine((printer, ctx) => {
    if (printer.ip === undefined && printer.name === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ip"],
        message:
          'a printer requires "ip" or "name": without either, the app falls back to discovering the default model on the network',
      });
    }
  });

const printersSchema = z
  .record(z.string().min(1), printerSchema)
  .refine((printers) => Object.keys(printers).length > 0, {
    message: "printers must declare at least one printer",
  });

// A partial pipeline: every profile key is optional and may be set to `null`
// to unset an inherited value. Cross-field rules wait for the merged profile.
const nullableProfileShape = Object.fromEntries(
  PROFILE_KEYS.map((key) => [key, configSchema.shape[key].nullable()]),
) as {
  [K in (typeof PROFILE_KEYS)[number]]: z.ZodNullable<
    (typeof configSchema.shape)[K]
  >;
};

/** Settings shared by every profile through `defaults`. */
export const defaultsSchema = z.strictObject(nullableProfileShape);

/** A named profile: shared settings plus its parent in the inheritance chain. */
export const profileSchema = z.strictObject({
  ...nullableProfileShape,
  extends: z.string().min(1).optional(),
});

const rawConfigShape = {
  ...configSchema.shape,
  defaults: defaultsSchema.optional(),
  profiles: z.record(z.string().min(1), profileSchema).optional(),
  targets: targetsSchema.optional(),
  printers: printersSchema.optional(),
};

const rawConfigObjectSchema = z.strictObject(rawConfigShape);

export type RawConfig = z.infer<typeof rawConfigObjectSchema>;
export type RawTarget = z.infer<typeof targetSchema>;
export type RawProfile = z.infer<typeof profileSchema>;
export type RawDefaults = z.infer<typeof defaultsSchema>;

function addPrinterConflicts(raw: RawConfig, ctx: z.RefinementCtx): void {
  if (raw.printers === undefined) {
    return;
  }

  for (const key of PRINTER_KEYS) {
    if (raw[key] === undefined) {
      continue;
    }
    ctx.addIssue({
      code: "custom",
      path: [key],
      message: REGISTRATION_KEYS.has(key)
        ? `${key} cannot be used with printers: the labels and the emulated duplex are declared per target (each target key is a label; use duplex: "emulated")`
        : `${key} cannot be used with printers: set it inside each printers.<id> entry`,
    });
  }

  if (raw.targets !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["targets"],
      message:
        "targets cannot be used with printers: declare the targets inside each printers.<id> entry",
    });
  }
}

function addExtendsIssue(
  name: string,
  profiles: Record<string, RawProfile>,
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>([name]);
  let parent = profiles[name].extends;
  while (parent !== undefined && parent !== DEFAULT_PROFILE) {
    if (seen.has(parent)) {
      ctx.addIssue({
        code: "custom",
        path: ["profiles", name, "extends"],
        message: `profile "${name}" has a circular extends chain`,
      });
      return;
    }
    if (!Object.hasOwn(profiles, parent)) {
      ctx.addIssue({
        code: "custom",
        path: ["profiles", name, "extends"],
        message: `unknown profile "${parent}"`,
      });
      return;
    }
    seen.add(parent);
    parent = profiles[parent].extends;
  }
}

function addProfileIssues(raw: RawConfig, ctx: z.RefinementCtx): void {
  if (raw.profiles === undefined) {
    return;
  }

  if (Object.hasOwn(raw.profiles, DEFAULT_PROFILE)) {
    ctx.addIssue({
      code: "custom",
      path: ["profiles", DEFAULT_PROFILE],
      message: `profile name "${DEFAULT_PROFILE}" is reserved: use the defaults block instead`,
    });
  }

  if (raw.targets === undefined && raw.printers === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["profiles"],
      message: "profiles require a targets or printers block to be selected",
    });
  }

  for (const name of Object.keys(raw.profiles)) {
    addExtendsIssue(name, raw.profiles, ctx);
  }
}

function addUnknownProfileIssues(
  targets: Record<string, RawTarget>,
  path: readonly string[],
  profiles: Record<string, RawProfile> | undefined,
  ctx: z.RefinementCtx,
): void {
  for (const [label, target] of Object.entries(targets)) {
    const profileName = target.profile ?? DEFAULT_PROFILE;
    if (profileName === DEFAULT_PROFILE) {
      continue;
    }
    if (profiles !== undefined && Object.hasOwn(profiles, profileName)) {
      continue;
    }
    ctx.addIssue({
      code: "custom",
      path: [...path, label, "profile"],
      message: `unknown profile "${profileName}"`,
    });
  }
}

function addTargetIssues(raw: RawConfig, ctx: z.RefinementCtx): void {
  if (raw.targets === undefined) {
    return;
  }

  if (raw.label !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["label"],
      message:
        "label cannot be used with targets: each target key is already a label",
    });
  }

  for (const key of LEGACY_DUPLEX_KEYS) {
    if (raw[key] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `${key} cannot be used with targets: declare a target with duplex: "emulated" instead`,
      });
    }
  }

  addUnknownProfileIssues(raw.targets, ["targets"], raw.profiles, ctx);
}

function addPrinterTargetIssues(raw: RawConfig, ctx: z.RefinementCtx): void {
  if (raw.printers === undefined) {
    return;
  }

  for (const [printerId, printer] of Object.entries(raw.printers)) {
    addUnknownProfileIssues(
      printer.targets,
      ["printers", printerId, "targets"],
      raw.profiles,
      ctx,
    );
  }
}

/**
 * The on-disk configuration file, before the profiles are resolved.
 *
 * Every historical flat key is still accepted, so a legacy file validates
 * exactly as it did before. `targets` lists the labels registered on the
 * implicit printer; its keys are the labels shown on the device.
 */
export const rawConfigSchema = rawConfigObjectSchema.superRefine((raw, ctx) => {
  addPrinterConflicts(raw, ctx);
  addProfileIssues(raw, ctx);
  addTargetIssues(raw, ctx);
  addPrinterTargetIssues(raw, ctx);
});
