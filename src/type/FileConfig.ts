import { z } from "zod";
import { DuplexAssemblyMode } from "./DuplexAssemblyMode.js";

// Configuration schema for the config file
export const configSchema = z
  .strictObject({
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
    // Note: width/height = 0 is treated as "not configured" by the business logic
    // width/height = "max" means "use device maximum"
    width: z
      .union([
        z.number().int().min(0), // 0 or positive integer (0 = not configured)
        z.literal("max"), // The string "max"
      ])
      .optional(), // Scan width in pixels
    height: z
      .union([
        z.number().int().min(0), // 0 or positive integer (0 = not configured)
        z.literal("max"), // The string "max"
      ])
      .optional(), // Scan height in pixels
    resolution: z.number().int().positive().optional(), // DPI resolution
    mode: z.enum(["Gray", "Color", "Lineart"]).optional(), // The scan mode
    paper_size: z.string().optional(), // Paper size preset (A4, Letter, Legal, A5, B5, Max)
    paper_orientation: z.enum(["portrait", "landscape"]).optional(), // Applied to paper_size only
    paper_dim: z.string().optional(), // Custom paper dimensions (e.g., "21x29.7cm", "8.5x11in")

    prefer_escl: z.boolean().optional(), // Always upload scans as PDF

    ///
    /// Duplex Scanning Options
    ///
    add_emulated_duplex: z.boolean().optional(), // Enable emulated duplex feature
    emulated_duplex_label: z.string().optional(), // Label for emulated duplex target
    emulated_duplex_assembly_mode: z
      .enum(Object.values(DuplexAssemblyMode))
      .optional(),

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
    paperless_token_file: z.string().optional(), // Paperless API token
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
  })
  .superRefine((value, ctx) => {
    if (value.paper_size !== undefined && value.paper_dim !== undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          "Config cannot specify both paper_size and paper_dim. Choose one or the other.",
        path: ["paper_size"],
      });
      ctx.addIssue({
        code: "custom",
        message:
          "Config cannot specify both paper_size and paper_dim. Choose one or the other.",
        path: ["paper_dim"],
      });
    }

    const hasPaperSizeConfig =
      value.paper_size !== undefined || value.paper_dim !== undefined;

    // Consider width/height as configured only if they are defined and not 0
    // (0 is treated as "not set" in the codebase)
    const hasManualWidth =
      value.width !== undefined && value.width !== 0 && value.width !== "max";
    const hasManualHeight =
      value.height !== undefined &&
      value.height !== 0 &&
      value.height !== "max";
    const hasManualSize = hasManualWidth || hasManualHeight;

    if (hasPaperSizeConfig && hasManualSize) {
      if (hasManualWidth) {
        ctx.addIssue({
          code: "custom",
          message:
            "Config cannot specify width/height with paper_size or paper_dim. Choose one or the other.",
          path: ["width"],
        });
      }
      if (hasManualHeight) {
        ctx.addIssue({
          code: "custom",
          message:
            "Config cannot specify width/height with paper_size or paper_dim. Choose one or the other.",
          path: ["height"],
        });
      }
    }

    if (value.paper_orientation !== undefined) {
      if (value.paper_dim !== undefined) {
        ctx.addIssue({
          code: "custom",
          message:
            "paper_orientation cannot be used with paper_dim. Orientation is implicit in custom dimensions.",
          path: ["paper_orientation"],
        });
      }

      if (hasManualSize) {
        ctx.addIssue({
          code: "custom",
          message:
            "paper_orientation cannot be used with width/height. Orientation is implicit in pixel dimensions.",
          path: ["paper_orientation"],
        });
      }

      if (value.paper_size === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "paper_orientation requires paper_size to be set.",
          path: ["paper_orientation"],
        });
      }
    }
  });

// Infer the TypeScript type from the schema
export type FileConfig = z.infer<typeof configSchema>;
