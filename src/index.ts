#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import os from "os";
import { Bonjour } from "bonjour-service";
import config from "config";
import HPApi from "./HPApi";
import * as commitInfo from "./commitInfo.json";
import { PaperlessConfig } from "./paperless/PaperlessConfig";
import { NextcloudConfig } from "./nextcloud/NextcloudConfig";
import { startHealthCheckServer } from "./healthcheck";
import fs from "fs";
import { Command } from "@commander-js/extra-typings";
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
function getBoolFromConfig(name: string): boolean | undefined {
  return _getConfig<boolean>(name, typeof true);
}
function getStringFromConfig(name: string): string | undefined {
  return _getConfig<string>(name, typeof "");
}
function getNumberFromConfig(name: string): number | undefined {
  return _getConfig<number>(name, typeof 1);
}

function _getConfig<T>(name: string, expectedType: string): T | undefined {
  if (config.has(name)) {
    const value = config.get<T>(name);

    // Check if the value is of the expected type
    if (typeof value !== expectedType) {
      throw new Error(
        `Value for ${name} is not of the expected type: ${expectedType}, got: ${typeof value}`,
      );
    }

    return value;
  }

  return undefined;
}

//:
type ScanParametersOpts = {
  resolution?: string | undefined;
  height?: string | undefined;
  width?: string | undefined;
  pattern?: string | undefined;
  tempDirectory?: string | undefined;
  keepFiles?: boolean | undefined;
  nextcloudUploadFolder?: string | undefined;
  nextcloudPasswordFile?: string | undefined;
  nextcloudPassword?: string | undefined;
  nextcloudUsername?: string | undefined;
  nextcloudUrl?: string | undefined;
  directory?: string | undefined;
};
function setupScanParameters(commandName: string) {
  const command = new Command(commandName)
    .option(
      "-a, --address <ip>",
      "IP address of the device (this overrides -p)",
    )
    .option(
      "--device-up-polling-interval <deviceUpPollingInterval>",
      "Device up polling interval in milliseconds",
      parseFloat,
    )
    .option(
      "-n, --name <name>",
      "Name of the device for service discovery", // i.e. 'Deskjet 3520 series'
    )
    .option("-D, --debug", "Enable debug")
    .option(
      "-d, --directory <dir>",
      "Directory where scans are saved (default: /tmp/scan-to-pcRANDOM)",
    )
    .option(
      "-t, --temp-directory <dir>",
      "Temp directory used for processing (default: /tmp/scan-to-pcRANDOM)",
    )
    .option(
      "-p, --pattern <pattern>",
      'Pattern for filename (i.e. "scan"_dd.mm.yyyy_hh:MM:ss, default would be scanPageNUMBER), make sure that the pattern is enclosed in extra quotes',
    )
    .option(
      "-r, --resolution <dpi>",
      "Resolution in DPI of the scans (default: 200)",
    )
    .option("-w, --width <width>", "With in pixel of the scans (default: 2481)")
    .option(
      "-h, --height <height>",
      "Height in pixel of the scans (default: 3507)",
    )
    .option(
      "-s, --paperless-post-document-url <paperless_post_document_url>",
      "The paperless post document url (example: https://domain.tld/api/documents/post_document/)",
    )
    .option("-o, --paperless-token <paperless_token>", "The paperless token")
    .option(
      "--paperless-group-multi-page-scan-into-a-pdf",
      "Combine multiple scanned images into a single PDF document",
    )
    .option(
      "--paperless-always-send-as-pdf-file",
      "Always convert scan job to pdf before sending to paperless",
    )
    .option(
      "-k, --keep-files",
      "Keep the scan files on the file system (default: false)",
    )
    .option(
      "--nextcloud-url <nextcloud_url>",
      "The nextcloud url (example: https://domain.tld)",
    )
    .option(
      "--nextcloud-username <nextcloud_username>",
      "The nextcloud username",
    )
    .option(
      "--nextcloud-password <nextcloud_app_password>",
      "The nextcloud app password for username. Either this or nextcloud-password-file is required",
    )
    .option(
      "--nextcloud-password-file <nextcloud_app_password_file>",
      "File name that contains the nextcloud app password for username. Either this or nextcloud-password is required",
    )
    .option(
      "--nextcloud-upload-folder <nextcloud_upload_folder>",
      "The upload folder where documents or images are uploaded (default: scan)",
    );
  command.optsWithGlobals();
  return command;
}

async function getDeviceIp(options: {
  address?: string | undefined;
  name?: string | undefined;
}) {
  let ip = options.address || getStringFromConfig("ip");
  if (!ip) {
    const name = options.name || getStringFromConfig("name");
    ip = await findOfficejetIp(name || "HP Smart Tank Plus 570 series");
  }
  console.log(`Using device ip: ${ip}`);
  return ip;
}

function getIsDebug(options: { debug?: boolean | undefined }) {
  const debug =
    options.debug != null ? true : getBoolFromConfig("debug") || false;

  if (debug) {
    console.log(`IsDebug: ${debug}`);
  }
  return debug;
}

function getPaperlessConfig(parentOption: {
  paperlessPostDocumentUrl?: string | undefined;
  paperlessToken?: string | undefined;
  keepFiles?: boolean | undefined;
  paperlessGroupMultiPageScanIntoAPdf?: boolean | undefined;
  paperlessAlwaysSendAsPdfFile?: boolean | undefined;
}): PaperlessConfig | undefined {
  const paperlessPostDocumentUrl: string | undefined =
    parentOption.paperlessPostDocumentUrl ||
    getStringFromConfig("paperless_post_document_url");
  const configPaperlessToken: string | undefined =
    parentOption.paperlessToken || getStringFromConfig("paperless_token");

  if (paperlessPostDocumentUrl && configPaperlessToken) {
    const configPaperlessKeepFiles: boolean =
      parentOption.keepFiles || getBoolFromConfig("keep_files") || false;
    const groupMultiPageScanIntoAPdf: boolean =
      parentOption.paperlessGroupMultiPageScanIntoAPdf ||
      getBoolFromConfig("paperless_group_multi_page_scan_into_a_pdf") ||
      false;
    const alwaysSendAsPdfFile: boolean =
      parentOption.paperlessAlwaysSendAsPdfFile ||
      getBoolFromConfig("paperless_always_send_as_pdf_file") ||
      false;

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
  parentOption: ScanParametersOpts,
): NextcloudConfig | undefined {
  const configNextcloudUrl: string | undefined =
    parentOption.nextcloudUrl || getStringFromConfig("nextcloud_url");
  const configNextcloudUsername: string | undefined =
    parentOption.nextcloudUsername || getStringFromConfig("nextcloud_username");
  const configNextcloudPassword: string | undefined =
    parentOption.nextcloudPassword || getStringFromConfig("nextcloud_password");
  const configNextcloudPasswordFile: string | undefined =
    parentOption.nextcloudPasswordFile ||
    getStringFromConfig("nextcloud_password_file");

  if (
    configNextcloudUrl &&
    configNextcloudUsername &&
    (configNextcloudPassword || configNextcloudPasswordFile)
  ) {
    const configNextcloudUploadFolder =
      parentOption.nextcloudUploadFolder ||
      getStringFromConfig("nextcloud_upload_folder") ||
      "scan";
    const configNextcloudKeepFiles: boolean =
      parentOption.keepFiles || getBoolFromConfig("keep_files") || false;

    let nextcloudPassword: string;
    if (configNextcloudPasswordFile) {
      nextcloudPassword = fs
        .readFileSync(configNextcloudPasswordFile, "utf8")
        .trimEnd();
    } else {
      nextcloudPassword = configNextcloudPassword ?? "";
    }

    console.log(
      `Nextcloud configuration provided, url: ${configNextcloudUrl}, username: ${configNextcloudUsername}, password length: ${configNextcloudPassword?.length}, upload folder: ${configNextcloudUploadFolder}, keepFiles: ${configNextcloudKeepFiles}`,
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

type HealthCheckOptions = {
  healthCheckPort?: string;
  healthCheck?: boolean;
};
function getHealthCheckSetting(option: HealthCheckOptions) {
  const healthCheckEnabled: boolean =
    option.healthCheck || getBoolFromConfig("enableHealthCheck") === true;
  let healthCheckPort: number;
  if (option.healthCheckPort) {
    healthCheckPort = parseInt(option.healthCheckPort, 10);
  } else {
    healthCheckPort = getNumberFromConfig("healthCheckPort") || 3000;
  }
  return {
    isHealthCheckEnabled: healthCheckEnabled,
    healthCheckPort: healthCheckPort,
  };
}

function getScanConfiguration(option: ScanParametersOpts) {
  const directoryConfig: DirectoryConfig = {
    directory: option.directory || getStringFromConfig("directory"),
    tempDirectory: option.tempDirectory || getStringFromConfig("tempDirectory"),
    filePattern: option.pattern || getStringFromConfig("pattern"),
  };

  const configWidth = (
    option.width ||
    getNumberFromConfig("width") ||
    0
  ).toString();
  const width =
    configWidth.toLowerCase() === "max"
      ? Number.MAX_SAFE_INTEGER
      : parseInt(configWidth, 10);

  const configHeight = (
    option.height ||
    getNumberFromConfig("height") ||
    0
  ).toString();
  const height =
    configHeight.toLowerCase() === "max"
      ? Number.MAX_SAFE_INTEGER
      : parseInt(configHeight, 10);

  const paperlessConfig = getPaperlessConfig(option);
  const nextcloudConfig = getNextcloudConfig(option);

  const scanConfig: ScanConfig = {
    resolution:
      (option.resolution ? parseInt(option.resolution, 10) : undefined) ||
      getNumberFromConfig("resolution") ||
      200,
    width: width,
    height: height,
    directoryConfig,
    paperlessConfig,
    nextcloudConfig,
  };
  return scanConfig;
}

function getDeviceUpPollingInterval(parentOption: {
  deviceUpPollingInterval?: number | undefined;
}) {
  return (
    parentOption.deviceUpPollingInterval ||
    getNumberFromConfig("deviceUpPollingInterval") ||
    1000
  );
}

function createListenCliCmd() {
  return setupScanParameters("listen")
    .description("Listen the device for new scan job to save to this target")
    .option(
      "-l, --label <label>",
      "The label to display on the device (the default is the hostname)",
    )
    .option("--add-emulated-duplex", "Enable emulated duplex scanning")
    .option(
      "--emulated-duplex-label <label>",
      "The emulated duplex label to display on the device (the default is to suffix the main label with duplex)",
    )
    .option("--health-check", "Start an http health check endpoint")
    .option(
      "--health-check-port <health-check-port>",
      "Start an http health check endpoint",
    )
    .action(async (options) => {
      const ip = await getDeviceIp(options);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options);
      HPApi.setDebug(isDebug);

      const registrationConfigs: RegistrationConfig[] = [];

      const registrationConfig: RegistrationConfig = {
        label: options.label || getStringFromConfig("label") || os.hostname(),
        isDuplexSingleSide: false,
      };
      registrationConfigs.push(registrationConfig);

      if (
        options.addEmulatedDuplex ||
        getBoolFromConfig("add_emulated_duplex")
      ) {
        registrationConfigs.push({
          label:
            options.emulatedDuplexLabel ||
            getStringFromConfig("emulated_duplex_label") ||
            `${registrationConfig.label} duplex`,
          isDuplexSingleSide: true,
        });
      }

      const deviceUpPollingInterval = getDeviceUpPollingInterval(options);

      const healthCheckSetting = getHealthCheckSetting(options);
      if (healthCheckSetting.isHealthCheckEnabled) {
        startHealthCheckServer(healthCheckSetting.healthCheckPort);
      }

      const scanConfig = getScanConfiguration(options);

      await listenCmd(registrationConfigs, scanConfig, deviceUpPollingInterval);
    });
}

function createAdfAutoscanCliCmd() {
  return setupScanParameters("adf-autoscan")
    .description(
      "Automatically trigger a new scan job to this target once paper is detected in the automatic document feeder (adf)",
    )
    .option("--duplex", "If specified, the scan will be in duplex")
    .option(
      "--pdf",
      "If specified, the scan result will be a pdf document, the default is multiple jpeg files",
    )
    .option(
      "--pollingInterval <pollingInterval>",
      "Time interval in millisecond between each lookup for content in the automatic document feeder",
    )
    .option(
      "--start-scan-delay <startScanDelay>",
      "Once document are detected to be in the adf, this specify the wait delay in millisecond before triggering the scan",
    )
    .option("--health-check", "Start an http health check endpoint")
    .option("--health-check-port <port>", "Start an http health check endpoint")
    .action(async (options) => {
      const ip = await getDeviceIp(options);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options);
      HPApi.setDebug(isDebug);

      const deviceUpPollingInterval = getDeviceUpPollingInterval(options);

      const healthCheckSetting = getHealthCheckSetting(options);
      if (healthCheckSetting.isHealthCheckEnabled) {
        startHealthCheckServer(healthCheckSetting.healthCheckPort);
      }

      const scanConfig = getScanConfiguration(options);

      const adfScanConfig: AdfAutoScanConfig = {
        ...scanConfig,
        isDuplex:
          options.duplex || getBoolFromConfig("autoscan_duplex") || false,
        generatePdf: options.pdf || getBoolFromConfig("autoscan_pdf") || false,
        pollingInterval:
          (options.pollingInterval
            ? parseInt(options.pollingInterval, 10)
            : undefined) ||
          getNumberFromConfig("autoscan_pollingInterval") ||
          1000,
        startScanDelay:
          (options.startScanDelay
            ? parseInt(options.startScanDelay, 10)
            : undefined) ||
          getNumberFromConfig("autoscan_startScanDelay") ||
          5000,
      };

      await adfAutoscanCmd(adfScanConfig, deviceUpPollingInterval);
    });
}

function createSingleScanCliCmd() {
  return setupScanParameters("single-scan")
    .description("Trigger a new scan job")
    .option("--duplex", "If specified, the scan will be in duplex")
    .option(
      "--pdf",
      "If specified, the scan result will be a pdf document, the default is multiple jpeg files",
    )
    .action(async (options) => {
      const ip = await getDeviceIp(options);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options);
      HPApi.setDebug(isDebug);

      const deviceUpPollingInterval = getDeviceUpPollingInterval(options);

      const scanConfig = getScanConfiguration(options);

      const singleScanConfig: SingleScanConfig = {
        ...scanConfig,
        isDuplex:
          options.duplex || getBoolFromConfig("single_scan_duplex") || false,
        generatePdf:
          options.pdf || getBoolFromConfig("single_scan_pdf") || false,
      };

      await singleScanCmd(singleScanConfig, deviceUpPollingInterval);
    });
}

function createClearRegistrationsCliCmd() {
  const cmdClearRegistrations = new Command("clear-registrations")
    .description("Clear the list or registered target on the device")
    .option(
      "-a, --address <ip>",
      "IP address of the device (this overrides -p)",
    )
    .option(
      "-n, --name <name>",
      "Name of the device for service discovery", // i.e. 'Deskjet 3520 series'
    )
    .option("-D, --debug", "Enable debug")
    .action(async (options) => {
      const ip = await getDeviceIp(options);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options);
      HPApi.setDebug(isDebug);

      await clearRegistrationsCmd();
    });
  cmdClearRegistrations.optsWithGlobals();
  return cmdClearRegistrations;
}

async function main() {
  const program = new Command();

  const cmdListen = createListenCliCmd();
  program.addCommand(cmdListen, { isDefault: true });

  const cmdAdfAutoscan = createAdfAutoscanCliCmd();
  program.addCommand(cmdAdfAutoscan);

  const cmdSingleScan = createSingleScanCliCmd();
  program.addCommand(cmdSingleScan);

  const cmdClearRegistrations = createClearRegistrationsCliCmd();
  program.addCommand(cmdClearRegistrations);

  await program.parseAsync(process.argv);
}

console.log(`Current commit ID: ${commitInfo.commitId}`);
main().catch((err) => console.log(err));
