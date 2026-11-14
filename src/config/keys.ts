/**
 * Which configuration key belongs to which level of the resolved model.
 *
 * This table is the single source of truth used to split the file and to
 * validate the new blocks: a key that belongs to the pipeline cannot be set
 * on a printer, and the reverse is also true. `test/config-resolve.test.ts`
 * asserts that every key of `configSchema` is classified exactly once, so
 * adding an option without deciding where it lives fails the build.
 */

/** Process-wide settings. They cannot vary per printer or per target. */
export const GLOBAL_KEYS = [
  "debug",
  "enableHealthCheck",
  "healthCheckPort",
] as const;

/**
 * Settings of the device or of its long-lived listener: addressing, protocol
 * preference, polling intervals and the legacy registration keys.
 *
 * `label`, `add_emulated_duplex`, `emulated_duplex_label` and
 * `emulated_duplex_assembly_mode` are historical names for the registration;
 * they describe the implicit target and are rejected once explicit `targets`
 * are declared.
 */
export const PRINTER_KEYS = [
  "ip",
  "name",
  "label",
  "deviceUpPollingInterval",
  "prefer_escl",
  "add_emulated_duplex",
  "emulated_duplex_label",
  "emulated_duplex_assembly_mode",
  "autoscan_pollingInterval",
  "autoscan_startScanDelay",
] as const;

/**
 * Everything that produces or delivers a scan: file naming, scan settings,
 * delivery integrations, retention and post-processing. These keys may be
 * shared through `defaults`, a named profile or a target.
 */
export const PROFILE_KEYS = [
  "directory",
  "tempDirectory",
  "pattern",
  "width",
  "height",
  "resolution",
  "mode",
  "image_format",
  "paper_size",
  "paper_orientation",
  "paper_dim",
  "single_scan_duplex",
  "single_scan_pdf",
  "autoscan_duplex",
  "autoscan_pdf",
  "paperless_post_document_url",
  "paperless_token",
  "paperless_token_file",
  "paperless_group_multi_page_scan_into_a_pdf",
  "paperless_always_send_as_pdf_file",
  "nextcloud_url",
  "nextcloud_username",
  "nextcloud_password",
  "nextcloud_password_file",
  "nextcloud_upload_folder",
  "s3_url",
  "s3_region",
  "s3_access_key_id",
  "s3_secret_access_key",
  "s3_secret_access_key_file",
  "s3_bucket",
  "s3_prefix",
  "s3_force_path_style",
  "s3_session_token",
  "webhook_url",
  "webhook_auth",
  "webhook_auth_header",
  "webhook_secret",
  "webhook_secret_file",
  "webhook_token",
  "webhook_username",
  "webhook_password",
  "webhook_payload",
  "keep_files",
  "post_command_image",
  "post_command_pdf",
  "post_command_timeout",
] as const;

export type GlobalKey = (typeof GLOBAL_KEYS)[number];
export type PrinterKey = (typeof PRINTER_KEYS)[number];
export type ProfileKey = (typeof PROFILE_KEYS)[number];
