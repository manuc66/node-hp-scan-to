#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import os from "os";
import { Bonjour } from "bonjour-service";
import HPApi from "./HPApi";
import { PaperlessConfig } from "./paperless/PaperlessConfig";
import { NextcloudConfig } from "./nextcloud/NextcloudConfig";
import { startHealthCheckServer } from "./healthcheck";
import fs from "fs";
import { Command, Option } from "@commander-js/extra-typings";
import { RegistrationConfig } from "./type/scanTargetDefinitions";
import { listenCmd } from "./commands/listenCmd";
import { adfAutoscanCmd } from "./commands/adfAutoscanCmd";
import { singleScanCmd } from "./commands/singleScanCmd";
import { clearRegistrationsCmd } from "./commands/clearRegistrationsCmd";
import { DirectoryConfig } from "./type/directoryConfig";
import {
  AdfAutoScanConfig,
  ScanConfig,
  SingleScanConfig,
} from "./type/scanConfigs";
import { FileConfig } from "./type/FileConfig";
import { HelpGroupsHeadings } from "./type/helpGroupsHeadings";

function findOfficejetIp(deviceNamePrefix: string): Promise<string> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    console.log("Searching device...");
    const browser = bonjour.find(
      {
        type: "http",
      },
      (service) => {
        console.log(".");
        if (
          service.name.startsWith(deviceNamePrefix) &&
          service.port === 80 &&
          service.type === "http" &&
          service.addresses != null
        ) {
          browser.stop();
          bonjour.destroy();
          console.log(`Found: ${service.name}`);
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
        'Pattern for filename (i.e. "scan"_dd.mm.yyyy_hh:MM:ss, default would be scanPageNUMBER), make sure that the pattern is enclosed in extra quotes',
      ).helpGroup(HelpGroupsHeadings.ouput),
    )
    .addOption(
      new Option(
        "-r, --resolution <dpi>",
        "Resolution in DPI of the scans (default: 200)",
      ).helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "-w, --width <width>",
        "Width in pixels of the scans (default: max)",
      ).helpGroup(HelpGroupsHeadings.scan),
    )
    .addOption(
      new Option(
        "-h, --height <height>",
        "Height in pixels of the scans (default: max)",
      ).helpGroup(HelpGroupsHeadings.scan),
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
        "The paperless token",
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
        "The nextcloud app password for username. Either this or nextcloud-password-file is required",
      ).helpGroup(HelpGroupsHeadings.nextcloud),
    )
    .addOption(
      new Option(
        "--nextcloud-password-file <nextcloud_app_password_file>",
        "File name that contains the nextcloud app password for username. Either this or nextcloud-password is required",
      ).helpGroup(HelpGroupsHeadings.nextcloud),
    )
    .addOption(
      new Option(
        "--nextcloud-upload-folder <nextcloud_upload_folder>",
        "The upload folder where documents or images are uploaded (default: scan)",
      ).helpGroup(HelpGroupsHeadings.nextcloud),
    );
}

async function getDeviceIp(options: ProgramOption, configFile: FileConfig) {
  let ip = getOptConfiguredValue(options.address, configFile.ip);
  if (!ip) {
    const name = getConfiguredValue(
      options.name,
      configFile.name,
      "HP Smart Tank Plus 570 series",
    );
    ip = await findOfficejetIp(name);
  }
  console.log(`Using device ip: ${ip}`);
  return ip;
}

function getIsDebug(options: ProgramOption, configFile: FileConfig) {
  const debug = getConfiguredValue(options.debug, configFile.debug, false);

  if (debug) {
    console.log(`IsDebug: ${debug}`);
  }
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

  if (paperlessPostDocumentUrl && configPaperlessToken) {
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

    console.log(
      `Paperless configuration provided, post document url: ${paperlessPostDocumentUrl}, the token length: ${configPaperlessToken.length}, keepFiles: ${configPaperlessKeepFiles}`,
    );
    return {
      postDocumentUrl: paperlessPostDocumentUrl,
      authToken: configPaperlessToken,
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
    configNextcloudUrl &&
    configNextcloudUsername &&
    (configNextcloudPassword || configNextcloudPasswordFile)
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
    if (configNextcloudPasswordFile) {
      nextcloudPassword = fs
        .readFileSync(configNextcloudPasswordFile, "utf8")
        .trimEnd();
    } else {
      nextcloudPassword = configNextcloudPassword ?? "";
    }

    const passLength = configNextcloudPassword?.length;
    const usernameLength = configNextcloudUsername.length;
    console.log(
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

function getHealthCheckSetting(
  options: AdfAutoscanOptions,
  configFile: FileConfig,
) {
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

  const configWidth = getConfiguredValue(
    options.width,
    fileConfig.width?.toString(),
    "0",
  );
  const width =
    configWidth.toLowerCase() === "max"
      ? Number.MAX_SAFE_INTEGER
      : parseInt(configWidth, 10);

  const configHeight = getConfiguredValue(
    options.height,
    fileConfig.height?.toString(),
    "0",
  );
  const height =
    configHeight.toLowerCase() === "max"
      ? Number.MAX_SAFE_INTEGER
      : parseInt(configHeight, 10);

  const paperlessConfig = getPaperlessConfig(options, fileConfig);
  const nextcloudConfig = getNextcloudConfig(options, fileConfig);

  const resolution = parseInt(
    getConfiguredValue(
      options.resolution,
      fileConfig.resolution?.toString(),
      "200",
    ),
    10,
  );

  const scanConfig: ScanConfig = {
    resolution,
    width: width,
    height: height,
    directoryConfig,
    paperlessConfig,
    nextcloudConfig,
    preferEscl: options.preferESCL || true
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
        "--add-emulated-duplex",
        "Enable emulated duplex scanning",
      ).helpGroup(HelpGroupsHeadings.deviceControlScreen),
    )
    .addOption(
      new Option(
        "--emulated-duplex-label <label>",
        "The emulated duplex label to display on the device (the default is to suffix the main label with duplex)",
      ).helpGroup(HelpGroupsHeadings.deviceControlScreen),
    )
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
    )
    .action(async (_, cmd) => {
      const options = cmd.optsWithGlobals();
      const ip = await getDeviceIp(options, configFile);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options, configFile);
      HPApi.setDebug(isDebug);

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
          options.addEmulatedDuplex,
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
        });
      }

      const deviceUpPollingInterval = getDeviceUpPollingInterval(
        options,
        configFile,
      );

      const healthCheckSetting = getHealthCheckSetting(options, configFile);
      if (healthCheckSetting.isHealthCheckEnabled) {
        startHealthCheckServer(healthCheckSetting.healthCheckPort);
      }

      const scanConfig = getScanConfiguration(options, configFile);

      await listenCmd(registrationConfigs, scanConfig, deviceUpPollingInterval);
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
    .addOption(
      new Option(
        "--health-check",
        "Start an http health check endpoint",
      ).helpGroup(HelpGroupsHeadings.healthCheck),
    )
    .addOption(
      new Option(
        "--health-check-port <port>",
        "Define the port for the HTTP health check endpoint",
      ).helpGroup(HelpGroupsHeadings.healthCheck),
    )
    .action(async (_, cmd) => {
      const options = cmd.optsWithGlobals();

      const ip = await getDeviceIp(options, fileConfig);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options, fileConfig);
      HPApi.setDebug(isDebug);

      const deviceUpPollingInterval = getDeviceUpPollingInterval(
        options,
        fileConfig,
      );

      const healthCheckSetting = getHealthCheckSetting(options, fileConfig);
      if (healthCheckSetting.isHealthCheckEnabled) {
        startHealthCheckServer(healthCheckSetting.healthCheckPort);
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
          (options.pollingInterval
            ? parseInt(options.pollingInterval, 10)
            : undefined) ||
          fileConfig.autoscan_pollingInterval ||
          1000,
        startScanDelay:
          (options.startScanDelay
            ? parseInt(options.startScanDelay, 10)
            : undefined) ||
          fileConfig.autoscan_startScanDelay ||
          5000,
      };

      await adfAutoscanCmd(adfScanConfig, deviceUpPollingInterval);
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
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options, fileConfig);
      HPApi.setDebug(isDebug);

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

      await singleScanCmd(singleScanConfig, deviceUpPollingInterval);
    });
}

function createClearRegistrationsCliCmd(fileConfig: FileConfig) {
  return new Command("clear-registrations")
    .description("Clear the list or registered target on the device")
    .action(async (_, cmd) => {
      const options = cmd.optsWithGlobals();

      const ip = await getDeviceIp(options, fileConfig);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options, fileConfig);
      HPApi.setDebug(isDebug);

      await clearRegistrationsCmd();
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
    .option("-D, --debug", "Enable debug");
}

type ProgramOption = ReturnType<ReturnType<typeof createProgram>["opts"]>;

export function setupProgram(fileConfig: FileConfig) {
  const program = createProgram();

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
  return program;
}
