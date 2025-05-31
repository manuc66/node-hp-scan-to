#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import os from "os";
import { Bonjour } from "bonjour-service";
import config, { IConfig } from "config";
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
import { configSchema, FileConfig } from "./type/FileConfig";

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
    .option(
      "--device-up-polling-interval <deviceUpPollingInterval>",
      "Device up polling interval in milliseconds",
      parseFloat,
    )
    .option(
      "-n, --name <name>",
      "Name of the device for service discovery", // i.e. 'Deskjet 3520 series'
    )
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
}

async function getDeviceIp(options: ProgramOption, configFile: FileConfig) {
  let ip = options.address || configFile.ip;
  if (!ip) {
    const name = options.name || configFile.name;
    ip = await findOfficejetIp(name || "HP Smart Tank Plus 570 series");
  }
  console.log(`Using device ip: ${ip}`);
  return ip;
}

function getIsDebug(options: ProgramOption, configFile: FileConfig) {
  const debug = options.debug != null ? true : configFile.debug || false;

  if (debug) {
    console.log(`IsDebug: ${debug}`);
  }
  return debug;
}

function getPaperlessConfig(
  options: AdfAutoscanOptions | ListenOptions | SingleScanOptions,
  fileConfig: FileConfig,
): PaperlessConfig | undefined {
  const paperlessPostDocumentUrl: string | undefined =
    options.paperlessPostDocumentUrl || fileConfig.paperless_post_document_url;
  const configPaperlessToken: string | undefined =
    options.paperlessToken || fileConfig.paperless_token;

  if (paperlessPostDocumentUrl && configPaperlessToken) {
    const configPaperlessKeepFiles: boolean =
      options.keepFiles || fileConfig.keep_files || false;
    const groupMultiPageScanIntoAPdf: boolean =
      options.paperlessGroupMultiPageScanIntoAPdf ||
      fileConfig.paperless_group_multi_page_scan_into_a_pdf ||
      false;
    const alwaysSendAsPdfFile: boolean =
      options.paperlessAlwaysSendAsPdfFile ||
      fileConfig.paperless_always_send_as_pdf_file ||
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
  options: AdfAutoscanOptions | ListenOptions | SingleScanOptions,
  fileConfig: FileConfig,
): NextcloudConfig | undefined {
  const configNextcloudUrl: string | undefined =
    options.nextcloudUrl || fileConfig.nextcloud_url;
  const configNextcloudUsername: string | undefined =
    options.nextcloudUsername || fileConfig.nextcloud_username;
  const configNextcloudPassword: string | undefined =
    options.nextcloudPassword || fileConfig.nextcloud_password;
  const configNextcloudPasswordFile: string | undefined =
    options.nextcloudPasswordFile || fileConfig.nextcloud_password_file;

  if (
    configNextcloudUrl &&
    configNextcloudUsername &&
    (configNextcloudPassword || configNextcloudPasswordFile)
  ) {
    const configNextcloudUploadFolder =
      options.nextcloudUploadFolder ||
      fileConfig.nextcloud_upload_folder ||
      "scan";
    const configNextcloudKeepFiles: boolean =
      options.keepFiles || fileConfig.keep_files || false;

    let nextcloudPassword: string;
    if (configNextcloudPasswordFile) {
      nextcloudPassword = fs
        .readFileSync(configNextcloudPasswordFile, "utf8")
        .trimEnd();
    } else {
      nextcloudPassword = configNextcloudPassword ?? "";
    }

    const passLength = configNextcloudPassword?.length;
    console.log(
      `Nextcloud configuration provided, url: ${configNextcloudUrl}, username: ${configNextcloudUsername}, password length: ${passLength}, upload folder: ${configNextcloudUploadFolder}, keepFiles: ${configNextcloudKeepFiles}`,
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

function getHealthCheckSetting(
  options: AdfAutoscanOptions,
  configFile: FileConfig,
) {
  const healthCheckEnabled: boolean =
    options.healthCheck || configFile.enableHealthCheck === true;
  let healthCheckPort: number;
  if (options.healthCheckPort) {
    healthCheckPort = parseInt(options.healthCheckPort, 10);
  } else {
    healthCheckPort = configFile.healthCheckPort || 3000;
  }
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
    directory: options.directory || fileConfig.directory,
    tempDirectory: options.tempDirectory || fileConfig.tempDirectory,
    filePattern: options.pattern || fileConfig.pattern,
  };

  const configWidth = (options.width || fileConfig.width || 0).toString();
  const width =
    configWidth.toLowerCase() === "max"
      ? Number.MAX_SAFE_INTEGER
      : parseInt(configWidth, 10);

  const configHeight = (options.height || fileConfig.height || 0).toString();
  const height =
    configHeight.toLowerCase() === "max"
      ? Number.MAX_SAFE_INTEGER
      : parseInt(configHeight, 10);

  const paperlessConfig = getPaperlessConfig(options, fileConfig);
  const nextcloudConfig = getNextcloudConfig(options, fileConfig);

  const scanConfig: ScanConfig = {
    resolution:
      (options.resolution ? parseInt(options.resolution, 10) : undefined) ||
      fileConfig.resolution ||
      200,
    width: width,
    height: height,
    directoryConfig,
    paperlessConfig,
    nextcloudConfig,
  };
  return scanConfig;
}

function getDeviceUpPollingInterval(
  options: AdfAutoscanOptions | ListenOptions | SingleScanOptions,
  configFile: FileConfig,
) {
  return (
    options.deviceUpPollingInterval ||
    configFile.deviceUpPollingInterval ||
    1000
  );
}

export type ListenOptions = ReturnType<
  ReturnType<typeof createListenCliCmd>["opts"]
>;
function createListenCliCmd(configFile: FileConfig) {
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
    .action(async (_, cmd) => {
      const options = cmd.optsWithGlobals();
      const ip = await getDeviceIp(options, configFile);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(options, configFile);
      HPApi.setDebug(isDebug);

      const registrationConfigs: RegistrationConfig[] = [];

      const registrationConfig: RegistrationConfig = {
        label: options.label || configFile.label || os.hostname(),
        isDuplexSingleSide: false,
      };
      registrationConfigs.push(registrationConfig);

      if (options.addEmulatedDuplex || configFile.add_emulated_duplex) {
        registrationConfigs.push({
          label:
            options.emulatedDuplexLabel ||
            configFile.emulated_duplex_label ||
            `${registrationConfig.label} duplex`,
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

export type AdfAutoscanOptions = ReturnType<
  ReturnType<typeof createAdfAutoscanCliCmd>["opts"]
>;
function createAdfAutoscanCliCmd(fileConfig: FileConfig) {
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
        isDuplex: options.duplex || fileConfig.autoscan_duplex || false,
        generatePdf: options.pdf || fileConfig.autoscan_pdf || false,
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

export type SingleScanOptions = ReturnType<
  ReturnType<typeof createSingleScanCliCmd>["opts"]
>;
function createSingleScanCliCmd(fileConfig: FileConfig) {
  return setupScanParameters("single-scan")
    .description("Trigger a new scan job")
    .option("--duplex", "If specified, the scan will be in duplex")
    .option(
      "--pdf",
      "If specified, the scan result will be a pdf document, the default is multiple jpeg files",
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
        isDuplex: options.duplex || fileConfig.single_scan_duplex || false,
        generatePdf: options.pdf || fileConfig.single_scan_pdf || false,
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

const validateConfig = (config: IConfig) => {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.format();
    throw new Error(
      `Configuration validation error: ${JSON.stringify(errors)}`,
    );
  }
  return result.data;
};

export function createProgram() {
  return new Command()
    .option(
      "-a, --address <ip>",
      "IP address of the device (this overrides -p)",
    )
    .option(
      "-n, --name <name>",
      "Name of the device for service discovery", // i.e. 'Deskjet 3520 series'
    )
    .option("-D, --debug", "Enable debug");
}

type ProgramOption = ReturnType<ReturnType<typeof createProgram>["opts"]>;

async function main() {
  const fileConfig: FileConfig = validateConfig(config);

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

  await program.parseAsync(process.argv);
}

console.log(`Current commit ID: ${commitInfo.commitId}`);
main().catch((err) => console.log(err));
