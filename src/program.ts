#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import os from "node:os";
// default-import + destructure: this dependency is CommonJS and some loaders
// (tsx) do not expose its named exports to ESM consumers
import bonjourService from "bonjour-service";

const { Bonjour } = bonjourService;
import DeviceClient from "./DeviceClient.js";
import type { PaperlessConfig } from "./paperless/PaperlessConfig.js";
import type { NextcloudConfig } from "./nextcloud/NextcloudConfig.js";
import type { S3Config } from "./s3/S3Config.js";
import { startHealthCheckServer } from "./healthcheck.js";
import fs from "node:fs";
import { Command, Option } from "@commander-js/extra-typings";
import type { RegistrationConfig } from "./type/scanTargetDefinitions.js";
import { listenCmd } from "./commands/listenCmd.js";
import { adfAutoscanCmd } from "./commands/adfAutoscanCmd.js";
import { singleScanCmd } from "./commands/singleScanCmd.js";
import { clearRegistrationsCmd } from "./commands/clearRegistrationsCmd.js";
import type { DirectoryConfig } from "./type/directoryConfig.js";
import type {
  AdfAutoScanConfig,
  ScanConfig,
  SingleScanConfig,
} from "./type/scanConfigs.js";
import { discoverCmd } from "./commands/discoverCmd.js";
import type { FileConfig } from "./type/FileConfig.js";
import { HelpGroupsHeadings } from "./type/helpGroupsHeadings.js";
import type { Server as NetServer } from "node:net";
import { ScanMode } from "./type/scanMode.js";
import { DuplexAssemblyMode } from "./type/DuplexAssemblyMode.js";
import { ScanFormat, parseScanFormat } from "./type/scanFormat.js";
import { validateFilePatternForPlatform } from "./fileNameValidation.js";
import { getLoggerForFile, setDebugLevel } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);
function findOfficejetIp(deviceNamePrefix: string): Promise<string> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    logger.info("Searching device...");
    const browser = bonjour.find(
      {
        type: "http",
      },
      (service) => {
        if (
          service.name.startsWith(deviceNamePrefix) &&
          service.port === 80 &&
          service.type === "http" &&
          service.addresses !== undefined
        ) {
          browser.stop();
          bonjour.destroy();
          logger.info(`Found: ${service.name}`);
          resolve(service.addresses[0]);
        }
      },
    );
    browser.start();
  });
}

function setupScanParameters(commandName: string) {
  return new Command<[], ProgramOption>(commandName)
    .addOption(
      new Option(
        "-d, --directory <dir>",
        "Directory where scans are saved (default: /tmp/scan-to-pcRANDOM)",
      ).helpGroup(HelpGroupsHeadings.ouput),
    )
    .addOption(
      new Option(
        "-p, --pattern <pattern>",
        'Pattern for filename (i.e. "scan"_dd.mm.yyyy_HHMMss, default would be scanPageNUMBER), make sure that the pattern is enclosed in extra quotes, avoid ":" as it is invalid on windows',
      ).helpGroup(HelpGroupsHeadings.ouput),
    )
    .addOption(
      new Option(
        "-r, --resolution <dpi>",
        "Resolution in DPI of the scans (default: 200)",
      ).helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option("--mode <mode>", "Selects the scan mode (default: Color)")
        .choices(["Gray", "Color"])
        .helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "-w, --width <width>",
        "Width in pixels of the scans (default: max)",
      )
        .conflicts("paperSize")
        .conflicts("paperDim")
        .helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "-h, --height <height>",
        "Height in pixels of the scans (default: max)",
      )
        .conflicts("paperSize")
        .conflicts("paperDim")
        .helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "--paper-size <size>",
        "Paper size preset: A4 (default), Letter, Legal, A5, B5, or Max (case-insensitive)",
      )
        .conflicts("paperDim")
        .conflicts("width")
        .conflicts("height")
        .helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "--paper-orientation <orientation>",
        "Paper orientation: portrait (default) or landscape. Applied to --paper-size only.",
      )
        .choices(["portrait", "landscape"])
        .conflicts("paperDim")
        .conflicts("width")
        .conflicts("height")
        .helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "--paper-dim <dimensions>",
        "Custom paper dimensions with unit (e.g., 21x29.7cm, 8.5x11in, 210x297mm). Cannot be used with --paper-size.",
      )
        .conflicts("paperSize")
        .conflicts("width")
        .conflicts("height")
        .helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "-f, --image-format <format>",
        "Image format for scans (when not PDF): Jpeg (default) or Bmp",
      )
        .argParser((val) => {
          const parsed = parseScanFormat(val);
          if (parsed === undefined) {
            throw new Error(
              `Invalid format: ${val}. Expected "Jpeg" or "Bmp" (case-insensitive).`,
            );
          }
          return parsed;
        })
        .helpGroup(HelpGroupsHeadings.ouput),
    )
    .addOption(
      new Option(
        "-t, --temp-directory <dir>",
        "Temp directory used for processing (default: /tmp/scan-to-pcRANDOM)",
      ).helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "--prefer-eSCL",
        "Prefer eSCL protocol if available",
      ).helpGroup(HelpGroupsHeadings.scan),
    )
    .option(
      "--device-up-polling-interval <deviceUpPollingInterval>",
      "Device up polling interval in milliseconds",
      parseFloat,
    )
    .addOption(
      new Option(
        "-s, --paperless-post-document-url <paperless_post_document_url>",
        "The paperless post document url (example: https://domain.tld/api/documents/post_document/)",
      ).helpGroup(HelpGroupsHeadings.paperless),
    )
    .addOption(
      new Option(
        "-o, --paperless-token <paperless_token>",
        "The paperless token. Either this or paperless-token-file is required for paperless integration.",
      ).helpGroup(HelpGroupsHeadings.paperless),
    )
    .addOption(
      new Option(
        "--paperless-token-file <paperless_token_file>",
        "File name that contains the paperless token. Either this or paperless-token is required for paperless integration.",
      ).helpGroup(HelpGroupsHeadings.paperless),
    )
    .addOption(
      new Option(
        "--paperless-group-multi-page-scan-into-a-pdf",
        "Combine multiple scanned images into a single PDF document",
      ).helpGroup(HelpGroupsHeadings.paperless),
    )
    .addOption(
      new Option(
        "--paperless-always-send-as-pdf-file",
        "Always convert scan job to pdf before sending to paperless",
      ).helpGroup(HelpGroupsHeadings.paperless),
    )
    .addOption(
      new Option(
        "-k, --keep-files",
        "Keep the scan files on the file system when sent to external systems for local backup and easy access (default: false)",
      ).helpGroup(HelpGroupsHeadings.ouput),
    )
    .addOption(
      new Option(
        "--nextcloud-url <nextcloud_url>",
        "The nextcloud url (example: https://domain.tld)",
      ).helpGroup(HelpGroupsHeadings.nextcloud),
    )
    .addOption(
      new Option(
        "--nextcloud-username <nextcloud_username>",
        "The nextcloud username",
      ).helpGroup(HelpGroupsHeadings.nextcloud),
    )
    .addOption(
      new Option(
        "--nextcloud-password <nextcloud_app_password>",
        "The nextcloud app password for username. Either this or nextcloud-password-file is required for nextcloud integration.",
      ).helpGroup(HelpGroupsHeadings.nextcloud),
    )
    .addOption(
      new Option(
        "--nextcloud-password-file <nextcloud_app_password_file>",
        "File name that contains the nextcloud app password for username. Either this or nextcloud-password is required for nextcloud integration.",
      ).helpGroup(HelpGroupsHeadings.nextcloud),
    )
    .addOption(
      new Option(
        "--nextcloud-upload-folder <nextcloud_upload_folder>",
        "The upload folder where documents or images are uploaded (default: scan)",
      ).helpGroup(HelpGroupsHeadings.nextcloud),
    )
    .addOption(
      new Option(
        "--s3-url <s3_url>",
        "The S3-compatible endpoint url (example: https://s3.us-east-1.amazonaws.com)",
      ).helpGroup(HelpGroupsHeadings.s3),
    )
    .addOption(
      new Option(
        "--s3-region <s3_region>",
        "The S3 region used for request signing (default: us-east-1)",
      ).helpGroup(HelpGroupsHeadings.s3),
    )
    .addOption(
      new Option(
        "--s3-access-key-id <s3_access_key_id>",
        "The S3 access key id",
      ).helpGroup(HelpGroupsHeadings.s3),
    )
    .addOption(
      new Option(
        "--s3-secret-access-key <s3_secret_access_key>",
        "The S3 secret access key. Either this or s3-secret-access-key-file is required for the s3 integration.",
      ).helpGroup(HelpGroupsHeadings.s3),
    )
    .addOption(
      new Option(
        "--s3-secret-access-key-file <s3_secret_access_key_file>",
        "File name that contains the S3 secret access key. Either this or s3-secret-access-key is required for the s3 integration.",
      ).helpGroup(HelpGroupsHeadings.s3),
    )
    .addOption(
      new Option(
        "--s3-bucket <s3_bucket>",
        "The S3 bucket where scans are uploaded",
      ).helpGroup(HelpGroupsHeadings.s3),
    )
    .addOption(
      new Option(
        "--s3-prefix <s3_prefix>",
        "The folder (prefix) inside the bucket where scans are uploaded (default: bucket root)",
      ).helpGroup(HelpGroupsHeadings.s3),
    )
    .addOption(
      new Option(
        "--s3-force-path-style",
        "Force path-style addressing (required for MinIO, Cloudflare R2, Wasabi...)",
      ).helpGroup(HelpGroupsHeadings.s3),
    )
    .addOption(
      new Option(
        "--s3-session-token <s3_session_token>",
        "The S3 session token for temporary credentials (optional)",
      ).helpGroup(HelpGroupsHeadings.s3),
    );
}

async function getDeviceIp(
  options: ProgramOption,
  configFile: FileConfig,
): Promise<string> {
  let ip = getOptConfiguredValue(options.address, configFile.ip);
  if (ip === undefined) {
    const name = getConfiguredValue(
      options.name,
      configFile.name,
      "HP Smart Tank Plus 570 series",
    );
    ip = await findOfficejetIp(name);
  }
  logger.info(`Using device at IP: ${ip}`);
  return ip;
}

function getIsDebug(options: ProgramOption, configFile: FileConfig) {
  const debug = getConfiguredValue(options.debug, configFile.debug, false);

  logger.info(`IsDebug: ${debug}`);

  return debug;
}

function getPaperlessConfig(
  options: AdfAutoscanOptions | ListenOptions | SingleScanOptions,
  fileConfig: FileConfig,
): PaperlessConfig | undefined {
  const paperlessPostDocumentUrl = getOptConfiguredValue(
    options.paperlessPostDocumentUrl,
    fileConfig.paperless_post_document_url,
  );
  const configPaperlessToken = getOptConfiguredValue(
    options.paperlessToken,
    fileConfig.paperless_token,
  );

  const configPaperlessTokenFile = getOptConfiguredValue(
    options.paperlessTokenFile,
    fileConfig.paperless_token_file,
  );

  if (
    paperlessPostDocumentUrl !== undefined &&
    (configPaperlessToken !== undefined ||
      configPaperlessTokenFile !== undefined)
  ) {
    const configPaperlessKeepFiles = getConfiguredValue(
      options.keepFiles,
      fileConfig.keep_files,
      false,
    );
    const groupMultiPageScanIntoAPdf = getConfiguredValue(
      options.paperlessGroupMultiPageScanIntoAPdf,
      fileConfig.paperless_group_multi_page_scan_into_a_pdf,
      false,
    );
    const alwaysSendAsPdfFile = getConfiguredValue(
      options.paperlessAlwaysSendAsPdfFile,
      fileConfig.paperless_always_send_as_pdf_file,
      false,
    );

    let paperlessToken: string;
    if (configPaperlessTokenFile !== undefined) {
      paperlessToken = fs
        .readFileSync(configPaperlessTokenFile, "utf8")
        .trimEnd();
    } else {
      paperlessToken = configPaperlessToken ?? "";
    }

    logger.info(
      `Paperless configuration provided, post document url: ${paperlessPostDocumentUrl}, the token length: ${paperlessToken.length}, keepFiles: ${configPaperlessKeepFiles}`,
    );
    return {
      postDocumentUrl: paperlessPostDocumentUrl,
      authToken: paperlessToken,
      keepFiles: configPaperlessKeepFiles,
      groupMultiPageScanIntoAPdf: groupMultiPageScanIntoAPdf,
      alwaysSendAsPdfFile: alwaysSendAsPdfFile,
    };
  } else {
    return undefined;
  }
}

function getNextcloudConfig(
  options: AdfAutoscanOptions | ListenOptions | SingleScanOptions,
  fileConfig: FileConfig,
): NextcloudConfig | undefined {
  const configNextcloudUrl = getOptConfiguredValue(
    options.nextcloudUrl,
    fileConfig.nextcloud_url,
  );
  const configNextcloudUsername = getOptConfiguredValue(
    options.nextcloudUsername,
    fileConfig.nextcloud_username,
  );
  const configNextcloudPassword = getOptConfiguredValue(
    options.nextcloudPassword,
    fileConfig.nextcloud_password,
  );
  const configNextcloudPasswordFile = getOptConfiguredValue(
    options.nextcloudPasswordFile,
    fileConfig.nextcloud_password_file,
  );

  if (
    configNextcloudUrl !== undefined &&
    configNextcloudUsername !== undefined &&
    (configNextcloudPassword !== undefined ||
      configNextcloudPasswordFile !== undefined)
  ) {
    const configNextcloudUploadFolder = getConfiguredValue(
      options.nextcloudUploadFolder,
      fileConfig.nextcloud_upload_folder,
      "scan",
    );
    const configNextcloudKeepFiles: boolean = getConfiguredValue(
      options.keepFiles,
      fileConfig.keep_files,
      false,
    );

    let nextcloudPassword: string;
    if (configNextcloudPasswordFile !== undefined) {
      nextcloudPassword = fs
        .readFileSync(configNextcloudPasswordFile, "utf8")
        .trimEnd();
    } else {
      nextcloudPassword = configNextcloudPassword ?? "";
    }

    const passLength = configNextcloudPassword?.length;
    const usernameLength = configNextcloudUsername.length;
    logger.info(
      `Nextcloud configuration provided, url: ${configNextcloudUrl}, username length: ${usernameLength}, password length: ${passLength}, upload folder: ${configNextcloudUploadFolder}, keepFiles: ${configNextcloudKeepFiles}`,
    );
    return {
      baseUrl: configNextcloudUrl,
      username: configNextcloudUsername,
      password: nextcloudPassword,
      uploadFolder: configNextcloudUploadFolder,
      keepFiles: configNextcloudKeepFiles,
    };
  } else {
    return undefined;
  }
}

function getS3Config(
  options: AdfAutoscanOptions | ListenOptions | SingleScanOptions,
  fileConfig: FileConfig,
): S3Config | undefined {
  const configS3Url = getOptConfiguredValue(options.s3Url, fileConfig.s3_url);
  const configS3Bucket = getOptConfiguredValue(
    options.s3Bucket,
    fileConfig.s3_bucket,
  );
  const configS3AccessKeyId = getOptConfiguredValue(
    options.s3AccessKeyId,
    fileConfig.s3_access_key_id,
  );
  const configS3SecretAccessKey = getOptConfiguredValue(
    options.s3SecretAccessKey,
    fileConfig.s3_secret_access_key,
  );
  const configS3SecretAccessKeyFile = getOptConfiguredValue(
    options.s3SecretAccessKeyFile,
    fileConfig.s3_secret_access_key_file,
  );

  if (
    configS3Url !== undefined &&
    configS3Bucket !== undefined &&
    configS3AccessKeyId !== undefined &&
    (configS3SecretAccessKey !== undefined ||
      configS3SecretAccessKeyFile !== undefined)
  ) {
    const region = getConfiguredValue(
      options.s3Region,
      fileConfig.s3_region,
      "us-east-1",
    );
    const prefix = getConfiguredValue(options.s3Prefix, fileConfig.s3_prefix, "");
    const forcePathStyle = getConfiguredValue(
      options.s3ForcePathStyle,
      fileConfig.s3_force_path_style,
      false,
    );
    const keepFiles: boolean = getConfiguredValue(
      options.keepFiles,
      fileConfig.keep_files,
      false,
    );
    const sessionToken = getOptConfiguredValue(
      options.s3SessionToken,
      fileConfig.s3_session_token,
    );

    let secretAccessKey: string;
    if (configS3SecretAccessKeyFile !== undefined) {
      secretAccessKey = fs
        .readFileSync(configS3SecretAccessKeyFile, "utf8")
        .trimEnd();
    } else {
      secretAccessKey = configS3SecretAccessKey ?? "";
    }

    logger.info(
      `S3 configuration provided, endpoint: ${configS3Url}, bucket: ${configS3Bucket}, region: ${region}, prefix: ${prefix}, forcePathStyle: ${forcePathStyle}, keepFiles: ${keepFiles}`,
    );
    const s3Config: S3Config = {
      endpointUrl: configS3Url,
      region,
      bucket: configS3Bucket,
      accessKeyId: configS3AccessKeyId,
      secretAccessKey,
      prefix,
      forcePathStyle,
      keepFiles,
    };
    if (sessionToken !== undefined && sessionToken.trim() !== "") {
      s3Config.sessionToken = sessionToken;
    }
    return s3Config;
  } else {
    return undefined;
  }
}

/**
 * Retrieves the configured value based on the provided options.
 * This function prioritizes the configuration from the command line if it is provided.
 * If the command line option is not defined, it checks the value from the config file.
 * Finally, if neither the command line nor the config file provides a value,
 * it returns the default value defined in the code.
 */
function getConfiguredValue<T>(
  cliOption: undefined | T,
  fileConfig: undefined | T,
  defaultValue: T,
): T {
  if (cliOption !== undefined) {
    return cliOption;
  }
  if (fileConfig !== undefined) {
    return fileConfig;
  }
  return defaultValue;
}

function getOptConfiguredValue<T>(
  option: undefined | T,
  config: undefined | T,
): T | undefined {
  return getConfiguredValue(option, config, undefined as T | undefined);
}

function getHealthCheckSetting(options: ProgramOption, configFile: FileConfig) {
  const healthCheckEnabled: boolean = getConfiguredValue(
    options.healthCheck,
    configFile.enableHealthCheck,
    false,
  );

  const healthCheckPort = parseInt(
    getConfiguredValue(
      options.healthCheckPort,
      configFile.healthCheckPort?.toString(),
      "3000",
    ),
    10,
  );

  return {
    isHealthCheckEnabled: healthCheckEnabled,
    healthCheckPort: healthCheckPort,
  };
}

function getScanConfiguration(
  options: AdfAutoscanOptions | ListenOptions | SingleScanOptions,
  fileConfig: FileConfig,
) {
  const directoryConfig: DirectoryConfig = {
    directory: getOptConfiguredValue(options.directory, fileConfig.directory),
    tempDirectory: getOptConfiguredValue(
      options.tempDirectory,
      fileConfig.tempDirectory,
    ),
    filePattern: getOptConfiguredValue(options.pattern, fileConfig.pattern),
  };

  if (directoryConfig.filePattern !== undefined) {
    // Fail early: a pattern producing an invalid file name would otherwise
    // crash at scan time.
    validateFilePatternForPlatform(directoryConfig.filePattern);
  }

  const paperlessConfig = getPaperlessConfig(options, fileConfig);
  const nextcloudConfig = getNextcloudConfig(options, fileConfig);
  const s3Config = getS3Config(options, fileConfig);

  const resolution = parseInt(
    getConfiguredValue(
      options.resolution,
      fileConfig.resolution?.toString(),
      "200",
    ),
    10,
  );

  const mode = getConfiguredValue(
    options.mode as ScanMode | undefined,
    fileConfig.mode as ScanMode | undefined,
    ScanMode.Color,
  );

  const preferEscl = getConfiguredValue(
    options.preferESCL,
    fileConfig.prefer_escl,
    false,
  );

  // Paper size configuration with precedence: CLI > Config > default (A4)
  const paperSize = getOptConfiguredValue(
    options.paperSize,
    fileConfig.paper_size,
  );

  const paperDim = getOptConfiguredValue(
    options.paperDim,
    fileConfig.paper_dim,
  );

  const paperOrientation = getOptConfiguredValue(
    options.paperOrientation,
    fileConfig.paper_orientation,
  );

  const hasPaperSizeConfig = paperSize !== undefined || paperDim !== undefined;

  const configWidth = getOptConfiguredValue(
    options.width,
    fileConfig.width?.toString(),
  );

  const configHeight = getOptConfiguredValue(
    options.height,
    fileConfig.height?.toString(),
  );

  if (
    hasPaperSizeConfig &&
    (configWidth !== undefined || configHeight !== undefined)
  ) {
    throw new Error(
      "Cannot specify both width/height and paper size (paper_size/paper_dim). Choose one or the other.",
    );
  }

  const providedWidth: number | "max" | undefined =
    configWidth === undefined
      ? undefined
      : configWidth.toLowerCase() === "max"
        ? "max"
        : parseInt(configWidth, 10);
  const providedHeight: number | "max" | undefined =
    configHeight === undefined
      ? undefined
      : configHeight.toLowerCase() === "max"
        ? undefined
        : parseInt(configHeight, 10);

  const format = getConfiguredValue(
    options.imageFormat,
    fileConfig.image_format,
    ScanFormat.Jpeg,
  );

  const scanConfig: ScanConfig = {
    resolution,
    mode,
    width: providedWidth,
    height: providedHeight,
    paperSize,
    paperDim,
    paperOrientation,
    format,
    directoryConfig,
    paperlessConfig,
    nextcloudConfig,
    s3Config,
    preferEscl,
  };
  return scanConfig;
}

function getDeviceUpPollingInterval(
  options: AdfAutoscanOptions | ListenOptions | SingleScanOptions,
  configFile: FileConfig,
) {
  return getConfiguredValue(
    options.deviceUpPollingInterval,
    configFile.deviceUpPollingInterval,
    1000,
  );
}

type ListenOptions = ReturnType<ReturnType<typeof createListenCliCmd>["opts"]>;

function createListenCliCmd(configFile: FileConfig) {
  return setupScanParameters("listen")
    .description("Listen the device for new scan job to save to this target")
    .addOption(
      new Option(
        "-l, --label <label>",
        "The label to display on the device (the default is the hostname)",
      ).helpGroup(HelpGroupsHeadings.deviceControlScreen),
    )
    .addOption(
      new Option(
        "--add-emulated-duplex [mode]",
        "Enable emulated duplex scanning, with optional assembly mode (default: document-wise)",
      )
        .choices(Object.values(DuplexAssemblyMode))
        .helpGroup(HelpGroupsHeadings.deviceControlScreen),
    )
    .addOption(
      new Option(
        "--emulated-duplex-label <label>",
        "The emulated duplex label to display on the device (the default is to suffix the main label with duplex)",
      ).helpGroup(HelpGroupsHeadings.deviceControlScreen),
    )
    .action(async (_, cmd) => {
      const options = cmd.optsWithGlobals();
      const ip = await getDeviceIp(options, configFile);
      const isDebug = getIsDebug(options, configFile);
      const api = new DeviceClient(ip, isDebug);

      const registrationConfigs: RegistrationConfig[] = [];

      const registrationConfig: RegistrationConfig = {
        label: getConfiguredValue(
          options.label,
          configFile.label,
          os.hostname(),
        ),
        isDuplexSingleSide: false,
      };
      registrationConfigs.push(registrationConfig);

      if (
        getConfiguredValue(
          options.addEmulatedDuplex === undefined ? undefined : true,
          configFile.add_emulated_duplex,
          false,
        )
      ) {
        registrationConfigs.push({
          label: getConfiguredValue(
            options.emulatedDuplexLabel,
            configFile.emulated_duplex_label,
            `${registrationConfig.label} duplex`,
          ),
          isDuplexSingleSide: true,
          duplexAssemblyMode: getConfiguredValue(
            options.addEmulatedDuplex === true
              ? DuplexAssemblyMode.DOCUMENT_WISE
              : options.addEmulatedDuplex,
            configFile.emulated_duplex_assembly_mode,
            DuplexAssemblyMode.DOCUMENT_WISE,
          ),
        });
      }

      const deviceUpPollingInterval = getDeviceUpPollingInterval(
        options,
        configFile,
      );

      let healthCheckSrv: NetServer | null = null;
      const healthCheckSetting = getHealthCheckSetting(options, configFile);
      if (healthCheckSetting.isHealthCheckEnabled) {
        healthCheckSrv = startHealthCheckServer(
          healthCheckSetting.healthCheckPort,
        );
      }

      const scanConfig = getScanConfiguration(options, configFile);

      await listenCmd(
        api,
        registrationConfigs,
        scanConfig,
        deviceUpPollingInterval,
      );

      healthCheckSrv?.close();
    });
}

type AdfAutoscanOptions = ReturnType<
  ReturnType<typeof createAdfAutoscanCliCmd>["opts"]
>;

function createAdfAutoscanCliCmd(fileConfig: FileConfig) {
  return setupScanParameters("adf-autoscan")
    .description(
      "Automatically trigger a new scan job to this target once paper is detected in the automatic document feeder (adf)",
    )
    .addOption(
      new Option(
        "--duplex",
        "If specified, all the scans will be in duplex if the device support it",
      ).helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "--pdf",
        "If specified, the scan result will always be a pdf document, the default depends on the device choice",
      ).helpGroup(HelpGroupsHeadings.ouput),
    )
    .addOption(
      new Option(
        "--pollingInterval <pollingInterval>",
        "Time interval in millisecond between each lookup for content in the automatic document feeder",
      ).helpGroup(HelpGroupsHeadings.adfAutoScan),
    )
    .addOption(
      new Option(
        "--start-scan-delay <startScanDelay>",
        "Once document are detected to be in the adf, this specify the wait delay in millisecond before triggering the scan",
      ).helpGroup(HelpGroupsHeadings.adfAutoScan),
    )
    .action(async (_, cmd) => {
      const options = cmd.optsWithGlobals();

      const ip = await getDeviceIp(options, fileConfig);
      const isDebug = getIsDebug(options, fileConfig);
      const api = new DeviceClient(ip, isDebug);

      const deviceUpPollingInterval = getDeviceUpPollingInterval(
        options,
        fileConfig,
      );

      let healthCheckSrv: NetServer | null = null;
      const healthCheckSetting = getHealthCheckSetting(options, fileConfig);
      if (healthCheckSetting.isHealthCheckEnabled) {
        healthCheckSrv = startHealthCheckServer(
          healthCheckSetting.healthCheckPort,
        );
      }

      const scanConfig = getScanConfiguration(options, fileConfig);

      const adfScanConfig: AdfAutoScanConfig = {
        ...scanConfig,
        isDuplex: getConfiguredValue(
          options.duplex,
          fileConfig.autoscan_duplex,
          false,
        ),
        generatePdf: getConfiguredValue(
          options.pdf,
          fileConfig.autoscan_pdf,
          false,
        ),
        pollingInterval:
          (options.pollingInterval !== undefined
            ? parseInt(options.pollingInterval, 10)
            : undefined) ??
          fileConfig.autoscan_pollingInterval ??
          1000,
        startScanDelay:
          (options.startScanDelay !== undefined
            ? parseInt(options.startScanDelay, 10)
            : undefined) ??
          fileConfig.autoscan_startScanDelay ??
          5000,
      };

      await adfAutoscanCmd(api, adfScanConfig, deviceUpPollingInterval);

      healthCheckSrv?.close();
    });
}

type SingleScanOptions = ReturnType<
  ReturnType<typeof createSingleScanCliCmd>["opts"]
>;

function createSingleScanCliCmd(fileConfig: FileConfig) {
  return setupScanParameters("single-scan")
    .description("Trigger a new scan job")
    .addOption(
      new Option(
        "--duplex",
        "If specified, all the scans will be in duplex if the device support it",
      ).helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "--pdf",
        "If specified, the scan result will always be a pdf document, the default depends on the device choice",
      ).helpGroup(HelpGroupsHeadings.ouput),
    )
    .action(async (_, cmd) => {
      const options = cmd.optsWithGlobals();

      const ip = await getDeviceIp(options, fileConfig);
      const isDebug = getIsDebug(options, fileConfig);
      const api = new DeviceClient(ip, isDebug);

      let healthCheckSrv: NetServer | null = null;
      const healthCheckSetting = getHealthCheckSetting(options, fileConfig);
      if (healthCheckSetting.isHealthCheckEnabled) {
        healthCheckSrv = startHealthCheckServer(
          healthCheckSetting.healthCheckPort,
        );
      }

      const deviceUpPollingInterval = getDeviceUpPollingInterval(
        options,
        fileConfig,
      );

      const scanConfig = getScanConfiguration(options, fileConfig);

      const singleScanConfig: SingleScanConfig = {
        ...scanConfig,
        isDuplex: getConfiguredValue(
          options.duplex,
          fileConfig.single_scan_duplex,
          false,
        ),
        generatePdf: getConfiguredValue(
          options.pdf,
          fileConfig.single_scan_pdf,
          false,
        ),
      };

      await singleScanCmd(api, singleScanConfig, deviceUpPollingInterval);

      healthCheckSrv?.close();
    });
}

function createClearRegistrationsCliCmd(fileConfig: FileConfig) {
  return new Command<[], ProgramOption>("clear-registrations")
    .description("Clear the list or registered target on the device")
    .action(async (_, cmd) => {
      const options: ProgramOption = cmd.optsWithGlobals();

      const ip = await getDeviceIp(options, fileConfig);
      const isDebug = getIsDebug(options, fileConfig);
      const api = new DeviceClient(ip, isDebug);

      let healthCheckSrv: NetServer | null = null;
      const healthCheckSetting = getHealthCheckSetting(options, fileConfig);
      if (healthCheckSetting.isHealthCheckEnabled) {
        healthCheckSrv = startHealthCheckServer(
          healthCheckSetting.healthCheckPort,
        );
      }

      await clearRegistrationsCmd(api);

      healthCheckSrv?.close();
    });
}

function createDiscoverCliCmd() {
  return new Command("discover")
    .description(
      "Discover HP scan-capable devices on the network, one 'name<TAB>ip' pair per line",
    )
    .addOption(
      new Option("--timeout <timeout>", "Browsing duration in seconds").default(
        "5",
      ),
    )
    .addOption(
      new Option("--json", "Output devices as a JSON array").default(false),
    )
    .addOption(
      new Option(
        "--ip <ip>",
        "Only verify that the given address hosts an HP scan-capable device",
      ),
    )
    .addOption(
      new Option(
        "--name <name>",
        "Only keep devices whose announced name starts with this prefix",
      ),
    )
    .action(async (options) => {
      const exitCode = await discoverCmd({
        timeoutSeconds: Number.parseInt(options.timeout, 10),
        json: options.json,
        ...(options.ip !== undefined && { ip: options.ip }),
        ...(options.name !== undefined && { name: options.name }),
      });
      process.exitCode = exitCode === 0 ? 0 : 1;
    });
}

function createProgram() {
  return new Command()
    .option(
      "-a, --address <ip>",
      "IP address of the device, when specified, the ip will be used instead of the name",
    )
    .option(
      "-n, --name <name>",
      "Name of the device to lookup for on the network", // i.e. 'Deskjet 3520 series'
    )
    .option("-D, --debug", "Enable debug")
    .addOption(
      new Option(
        "--health-check",
        "Start an http health check endpoint",
      ).helpGroup(HelpGroupsHeadings.healthCheck),
    )
    .addOption(
      new Option(
        "--health-check-port <health-check-port>",
        "Define the port for the HTTP health check endpoint",
      ).helpGroup(HelpGroupsHeadings.healthCheck),
    );
}

type ProgramOption = ReturnType<ReturnType<typeof createProgram>["opts"]>;

export function setupProgram(fileConfig: FileConfig) {
  const program = createProgram();

  program.hook("preAction", (thisCommand) => {
    const isDebug = getConfiguredValue(
      thisCommand.opts().debug,
      fileConfig.debug,
      false,
    );
    setDebugLevel(isDebug);
  });

  const cmdListen = createListenCliCmd(fileConfig);
  cmdListen.optsWithGlobals();
  program.addCommand(cmdListen, { isDefault: true });

  const cmdAdfAutoscan = createAdfAutoscanCliCmd(fileConfig);
  cmdAdfAutoscan.optsWithGlobals();
  program.addCommand(cmdAdfAutoscan);

  const cmdSingleScan = createSingleScanCliCmd(fileConfig);
  cmdSingleScan.optsWithGlobals();
  program.addCommand(cmdSingleScan);

  const cmdClearRegistrations = createClearRegistrationsCliCmd(fileConfig);
  cmdClearRegistrations.optsWithGlobals();
  program.addCommand(cmdClearRegistrations);

  const cmdDiscover = createDiscoverCliCmd();
  program.addCommand(cmdDiscover);
  return program;
}
