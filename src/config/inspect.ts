import type { FileConfig } from "../type/FileConfig.js";
import { selectPrinter } from "./select.js";
import type {
  ResolvedPrinter,
  ResolvedProgramConfig,
  ResolvedTarget,
} from "./types.js";

/**
 * Values the configuration is allowed to carry but which must never be printed:
 * they are credentials, and `config resolve` output commonly ends up pasted in
 * an issue. The `*_file` variants carry a path, not the secret itself.
 */
const SECRET_KEYS = [
  "paperless_token",
  "nextcloud_password",
  "s3_secret_access_key",
  "s3_session_token",
  "webhook_secret",
  "webhook_token",
  "webhook_password",
] as const;

/** URLs that may carry credentials in their userinfo part. */
const CREDENTIAL_URL_KEYS = [
  "nextcloud_url",
  "s3_url",
  "paperless_post_document_url",
] as const;

export interface ResolveView {
  printers: ResolveViewPrinter[];
}

export interface ResolveViewPrinter {
  id: string;
  targets: ResolveViewTarget[];
}

export interface ResolveViewTarget {
  label: string;
  duplex: "simplex" | "emulated";
  assembly_mode?: string;
  config: Record<string, unknown>;
}

/** Keeps the host of a credential-bearing URL, drops its path and query. */
function redactUrl(value: string): string {
  try {
    return `${new URL(value).origin}/***`;
  } catch {
    return "***";
  }
}

/** Drops the userinfo of a URL while keeping the rest of it intact. */
function redactUrlUserinfo(value: string): string {
  try {
    const url = new URL(value);
    if (url.username === "" && url.password === "") {
      return value;
    }
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "***";
  }
}

function redact(config: FileConfig): Record<string, unknown> {
  const output: Record<string, unknown> = { ...config };
  for (const key of SECRET_KEYS) {
    if (output[key] !== undefined) {
      output[key] = "***";
    }
  }

  // The webhook URL is the credential for n8n, Make and Zapier workloads: the
  // token lives in the path. Keep the host so the target is still identifiable.
  const webhookUrl = output["webhook_url"];
  if (typeof webhookUrl === "string") {
    output["webhook_url"] = redactUrl(webhookUrl);
  }

  // Other endpoints should not carry credentials in the URL (they have their
  // own username/password fields), but strip them if they do.
  for (const key of CREDENTIAL_URL_KEYS) {
    const value = output[key];
    if (typeof value === "string") {
      output[key] = redactUrlUserinfo(value);
    }
  }

  return output;
}

function toViewTarget(target: ResolvedTarget): ResolveViewTarget {
  return {
    label: target.label,
    duplex: target.isDuplexSingleSide ? "emulated" : "simplex",
    ...(target.duplexAssemblyMode !== undefined && {
      assembly_mode: target.duplexAssemblyMode,
    }),
    config: redact(target.config),
  };
}

function toViewPrinter(
  printer: ResolvedPrinter,
  targetLabel?: string,
): ResolveViewPrinter {
  const targets =
    targetLabel === undefined
      ? printer.targets
      : printer.targets.filter((target) => target.label === targetLabel);

  return {
    id: printer.id,
    targets: targets.map(toViewTarget),
  };
}

/**
 * Builds a printable, secret-free view of the effective configuration.
 *
 * It resolves `defaults`, `extends`, `null` and the profile selected by each
 * target, so it answers the only question that matters when a scan does not
 * behave as expected: what did this target actually inherit?
 */
export function buildResolveView(
  config: ResolvedProgramConfig,
  selection: { printer?: string; target?: string } = {},
): ResolveView {
  const printers =
    selection.printer === undefined
      ? config.printers
      : [selectPrinter(config, selection.printer)];

  const view = {
    printers: printers.map((printer) =>
      toViewPrinter(printer, selection.target),
    ),
  };

  if (selection.target !== undefined) {
    const matches = view.printers.flatMap((printer) => printer.targets);
    if (matches.length === 0) {
      const labels = printers
        .flatMap((printer) => printer.targets.map((target) => target.label))
        .join(", ");
      throw new Error(
        `unknown target "${selection.target}"; configured targets: ${labels}`,
      );
    }
  }

  return view;
}

/** JSON without any secret value, suitable for logs and bug reports. */
export function formatResolveView(view: ResolveView): string {
  return JSON.stringify(view, null, 2);
}
