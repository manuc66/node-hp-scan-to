import { z } from "zod";

// Configuration schema for the config file
export const configSchema = z.object({
  ///
  /// Network and Identification
  ///
  ip: z.string().optional(), // IP address of the device (optional)
  name: z.string().optional(), // Device name (used for mDNS if IP is not set)
  label: z.string().optional(), // Display label on the device screen

  ///
  /// Connectivity & Debug
  ///
  deviceUpPollingInterval: z.number().min(0).optional(), // Polling interval (ms) to check if device is reachable
  debug: z.boolean().optional(), // Enable debug mode for reporting issues

  ///
  /// Directories & File Naming
  ///
  directory: z.string().optional(), // Directory to store scan results
  tempDirectory: z.string().optional(), // Temporary directory for file processing
  pattern: z.string().optional(), // Pattern for naming scanned files

  ///
  /// Scan Settings
  ///
  width: z
    .union([
      z.number().int().positive(), // Positive integer
      z.literal("max"), // The string "max"
    ])
    .optional(), // Scan width in pixels
  height: z
    .union([
      z.number().int().positive(), // Positive integer
      z.literal("max"), // The string "max"
    ])
    .optional(), // Scan height in pixels
  resolution: z.number().int().positive().optional(), // DPI resolution

  prefer_escl: z.boolean().optional(), // Always upload scans as PDF

  ///
  /// Duplex Scanning Options
  ///
  add_emulated_duplex: z.boolean().optional(), // Enable emulated duplex feature
  emulated_duplex_label: z.string().optional(), // Label for emulated duplex target

  ///
  /// Single Scan Options
  ///
  single_scan_duplex: z.boolean().optional(), // Use duplex for single scans (if supported)
  single_scan_pdf: z.boolean().optional(), // Output format for single scans: PDF (true) or JPG (false)

  ///
  /// Auto Scan (Document Feeder)
  ///
  autoscan_duplex: z.boolean().optional(), // Use duplex for auto scans (if supported)
  autoscan_pdf: z.boolean().optional(), // Output format for auto scans: PDF (true) or JPG (false)
  autoscan_pollingInterval: z.number().min(0).optional(), // Interval (ms) to poll the document feeder
  autoscan_startScanDelay: z.number().min(0).optional(), // Delay (ms) before auto scan starts after feeder is loaded

  ///
  /// Paperless Integration
  ///
  paperless_post_document_url: z.string().optional(), // Paperless POST URL
  paperless_token: z.string().optional(), // Paperless API token
  paperless_group_multi_page_scan_into_a_pdf: z.boolean().optional(), // Group multi-page scans into a single PDF
  paperless_always_send_as_pdf_file: z.boolean().optional(), // Always upload scans as PDF

  ///
  /// Nextcloud Integration
  ///
  nextcloud_url: z.string().optional(), // Nextcloud server URL
  nextcloud_username: z.string().optional(), // Nextcloud username
  nextcloud_password: z.string().optional(), // Nextcloud password
  nextcloud_password_file: z.string().optional(), // Path to file containing Nextcloud password
  nextcloud_upload_folder: z.string().optional(), // Upload folder path on Nextcloud

  ///
  /// Common to external destination (paperless & nextcloud)
  ///
  keep_files: z.boolean().optional(), // Keep scanned files locally after upload

  ///
  /// Health Check
  ///
  enableHealthCheck: z.boolean().optional(), // Enable HTTP health check endpoint
  healthCheckPort: z.number().int().positive().max(65535).optional(), // Port for health check endpoint
});

// Infer the TypeScript type from the schema
export type FileConfig = z.infer<typeof configSchema>;
