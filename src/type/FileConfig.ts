import { z } from "zod";

// Define a schema
export const configSchema = z.object({
  // Optional IP address for the device
  ip: z.string().optional(),

  // Optional name of the device; if no IP is provided, this name will be used to resolve the device's IP with mDNS
  name: z.string().optional(),

  // Optional label to display on the device screen as a scan target
  label: z.string().optional(),

  // Optional flag to customize the device's network connectivity pooling when it can't be reached anymore
  deviceUpPollingInterval: z.number().min(0).optional(),

  // Optional to enable the debug mode (only use it to send bug report)
  debug: z.boolean().optional(),

  // Optional directory for storing files; default is the system's temp directory
  directory: z.string().optional(),

  // Optional temporary directory for processing files; if not provided, the system temporary directory will be used
  tempDirectory: z.string().optional(),

  // Optional pattern for naming scan files placed in the result directory
  pattern: z.string().optional(),

  // Optional pixel width for scanning; must be a positive integer
  width: z.number().int().positive().optional(),

  // Optional pixel height for scanning; must be a positive integer
  height: z.number().int().positive().optional(),

  // Optional DPI resolution for scanning; must be a positive integer
  resolution: z.number().int().positive().optional(),

  // Optional flag to enable emulated duplex feature that will add an entry for emulated duplex scanning
  add_emulated_duplex: z.boolean().optional(),

  // Optional label for the scan target in the emulated duplex feature
  emulated_duplex_label: z.string().optional(),

  ///
  // SINGLE SCAN OPTIONS
  ///
  // Optional flag indicating that a single scan should be executed with the device's duplex functionality (if supported)
  single_scan_duplex: z.boolean().optional(),
  // Optional flag indicating if the single scan output should be in PDF or JPG format
  single_scan_pdf: z.boolean().optional(),

  ///
  // AUTO SCAN FROM DOCUMENT FEEDER  OPTIONS
  ///
  // Optional flag indicating that all auto scans should be executed with the device's duplex functionality (if supported)
  autoscan_duplex: z.boolean().optional(),
  // Optional flag indicating that all auto scans output should be in PDF or JPG format
  autoscan_pdf: z.boolean().optional(),
  // Optional flag to customize the interval at with the device's document feeder status is inspected to trigger an automatic scan
  autoscan_pollingInterval: z.number().min(0).optional(),
  // Optional flag to customize the delay before starting an auto scan once the document feeder is loaded
  autoscan_startScanDelay: z.number().min(0).optional(),




  // Optional paperless document post url, ie: https://host.tld/api/documents/post_document/
  paperless_post_document_url: z.string().optional(),
  // Optional paperless document post token, ie: 3f5e7b8c2a4d1e9f0b8c3a2d4e5f6a7b8c9d0e1f
  paperless_token: z.string().optional(),
  // Optional flag to force that all multi page document upload in PDF format
  paperless_group_multi_page_scan_into_a_pdf: z.boolean().optional(),
  // Optional flag to force that all document upload in PDF format
  paperless_always_send_as_pdf_file: z.boolean().optional(),

  // Optional flag to enable removal of the file that are sent to parperless or nextcloud from the local result directory
  keep_files: z.boolean().optional(),

  // Optional flag to indicate the nextcloud url (example: https://domain.tld)
  nextcloud_url: z.string().optional(),

  // Optional flag to indicate the nextcloud username
  nextcloud_username: z.string().optional(),

  // Optional flag to indicate the nextcloud password
  nextcloud_password: z.string().optional(),

  // Optional flag to indicate the location of the file that contains the nextcloud password
  nextcloud_password_file: z.string().optional(),

  // Optional flag to indicate the nextcloud upload folder (example: /folder/subfolder)
  nextcloud_upload_folder: z.string().optional(),

  // Optional flag to enable the http health check endpoint
  enableHealthCheck: z.boolean().optional(),

  // Optional flag to indicate the port on which the health check endpoint is exposed
  healthCheckPort: z.number().int().positive().max(65535).optional()
});

// Infer the TypeScript type from the schema
export type FileConfig = z.infer<typeof configSchema>;

