import { z } from "zod";
import { configSchema } from "../type/FileConfig.js";
import { DuplexAssemblyMode } from "../type/DuplexAssemblyMode.js";
import { PROFILE_KEYS } from "./keys.js";
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

// A partial pipeline: every profile key is optional, and only pipeline keys
// are accepted. Cross-field rules wait for the merged profile.
const profileShape = Object.fromEntries(
  PROFILE_KEYS.map((key) => [key, configSchema.shape[key]]),
) as Pick<typeof configSchema.shape, (typeof PROFILE_KEYS)[number]>;

export const profileSettingsSchema = z.strictObject(profileShape);

/**
 * The on-disk configuration file, before the profiles are resolved.
 *
 * Every historical flat key is still accepted, so a legacy file validates
 * exactly as it did before. `targets` lists the labels registered on the
 * implicit printer; its keys are the labels shown on the device.
 */
export const rawConfigSchema = z
  .strictObject({
    ...configSchema.shape,
    defaults: profileSettingsSchema.optional(),
    profiles: z.record(z.string().min(1), profileSettingsSchema).optional(),
    targets: targetsSchema.optional(),
  })
  .superRefine((raw, ctx) => {
    if (raw.profiles !== undefined) {
      if (Object.hasOwn(raw.profiles, DEFAULT_PROFILE)) {
        ctx.addIssue({
          code: "custom",
          path: ["profiles", DEFAULT_PROFILE],
          message: `profile name "${DEFAULT_PROFILE}" is reserved: use the defaults block instead`,
        });
      }
      if (raw.targets === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["profiles"],
          message: "profiles require a targets block to be selected",
        });
      }
    }

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

    for (const [label, target] of Object.entries(raw.targets)) {
      const profileName = target.profile ?? DEFAULT_PROFILE;
      if (
        profileName !== DEFAULT_PROFILE &&
        (raw.profiles === undefined ||
          !Object.hasOwn(raw.profiles, profileName))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["targets", label, "profile"],
          message: `unknown profile "${profileName}"`,
        });
      }
    }
  });

export type RawConfig = z.infer<typeof rawConfigSchema>;
export type RawTarget = z.infer<typeof targetSchema>;
