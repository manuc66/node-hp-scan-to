#!/usr/bin/env node
// noinspection XmlDeprecatedElement,HtmlDeprecatedTag

"use strict";

import os from "os";
import { Command, Option, OptionValues, program } from "commander";
import { Bonjour } from "bonjour-service";
import config from "config";
import HPApi from "./HPApi";
import PathHelper from "./PathHelper";
import { delay } from "./delay";
import { readDeviceCapabilities } from "./readDeviceCapabilities";
import {
  clearRegistrations,
  RegistrationConfig,
  waitScanEvent,
} from "./listening";
import {
  AdfAutoScanConfig,
  DirectoryConfig,
  saveScanFromEvent,
  ScanConfig,
  scanFromAdf,
  waitAdfLoaded,
} from "./scanProcessing";
import * as commitInfo from "./commitInfo.json";
import { PaperlessConfig } from "./paperless/PaperlessConfig";
import { NextcloudConfig } from "./nextcloud/NextcloudConfig";
import { startHealthCheckServer } from "./healthcheck";
import fs from "fs";

let iteration = 0;

async function listenCmd(
  registrationConfig: RegistrationConfig,
  scanConfig: ScanConfig,
  deviceUpPollingInterval: number,
) {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp(deviceUpPollingInterval);
  let deviceUp = true;

  const folder = await PathHelper.getOutputFolder(
    scanConfig.directoryConfig.directory,
  );
  console.log(`Target folder: ${folder}`);

  const tempFolder = await PathHelper.getOutputFolder(
    scanConfig.directoryConfig.tempDirectory,
  );
  console.log(`Temp folder: ${tempFolder}`);

  const deviceCapabilities = await readDeviceCapabilities();

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  while (keepActive) {
    iteration++;
    console.log(`Running iteration: ${iteration} - errorCount: ${errorCount}`);
    try {
      const event = await waitScanEvent(deviceCapabilities, registrationConfig);
      scanCount = await PathHelper.getNextScanNumber(
        folder,
        scanCount,
        scanConfig.directoryConfig.filePattern,
      );
      console.log(`Scan event captured, saving scan #${scanCount}`);
      await saveScanFromEvent(
        event,
        folder,
        tempFolder,
        scanCount,
        deviceCapabilities,
        scanConfig,
      );
    } catch (e) {
      if (await HPApi.isAlive()) {
        console.log(e);
        errorCount++;
      } else {
        if (HPApi.isDebug()) {
          console.log(e);
        }
        deviceUp = false;
      }
    }

    if (errorCount === 50) {
      keepActive = false;
    }

    if (!deviceUp) {
      await HPApi.waitDeviceUp(deviceUpPollingInterval);
    } else {
      await delay(1000);
    }
  }
}

async function adfAutoscanCmd(
  adfAutoScanConfig: AdfAutoScanConfig,
  deviceUpPollingInterval: number,
) {
  // first make sure the device is reachable
  await HPApi.waitDeviceUp(deviceUpPollingInterval);
  let deviceUp = true;

  const folder = await PathHelper.getOutputFolder(
    adfAutoScanConfig.directoryConfig.directory,
  );
  console.log(`Target folder: ${folder}`);

  const tempFolder = await PathHelper.getOutputFolder(
    adfAutoScanConfig.directoryConfig.tempDirectory,
  );
  console.log(`Temp folder: ${tempFolder}`);

  const deviceCapabilities = await readDeviceCapabilities();

  let scanCount = 0;
  let keepActive = true;
  let errorCount = 0;
  while (keepActive) {
    iteration++;
    console.log(`Running iteration: ${iteration} - errorCount: ${errorCount}`);
    try {
      await waitAdfLoaded(
        adfAutoScanConfig.pollingInterval,
        adfAutoScanConfig.startScanDelay,
      );

      scanCount++;

      console.log(`Scan event captured, saving scan #${scanCount}`);

      await scanFromAdf(
        scanCount,
        folder,
        tempFolder,
        adfAutoScanConfig,
        deviceCapabilities,
        new Date(),
      );
    } catch (e) {
      console.log(e);
      if (await HPApi.isAlive()) {
        errorCount++;
      } else {
        deviceUp = false;
      }
    }

    if (errorCount === 50) {
      keepActive = false;
    }

    if (!deviceUp) {
      await HPApi.waitDeviceUp(deviceUpPollingInterval);
    } else {
      await delay(1000);
    }
  }
}

async function clearRegistrationsCmd(cmd: Command) {
  const parentOption = cmd.parent!.opts();

  const ip = await getDeviceIp(parentOption);
  HPApi.setDeviceIP(ip);

  const isDebug = getIsDebug(parentOption);
  HPApi.setDebug(isDebug);
  await clearRegistrations();
}

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

function getConfig<T>(name: string): T | undefined {
  return config.has(name) ? config.get<T>(name) : undefined;
}

function setupScanParameters(command: Command): Command {
  command.option(
    "-d, --directory <dir>",
    "Directory where scans are saved (default: /tmp/scan-to-pcRANDOM)",
  );
  command.option(
    "-t, --temp-directory <dir>",
    "Temp directory used for processing (default: /tmp/scan-to-pcRANDOM)",
  );
  command.option(
    "-p, --pattern <pattern>",
    'Pattern for filename (i.e. "scan"_dd.mm.yyyy_hh:MM:ss, default would be scanPageNUMBER), make sure that the patter is enclosed in extra quotes',
  );
  command.option(
    "-r, --resolution <dpi>",
    "Resolution in DPI of the scans (default: 200)",
  );
  command.option(
    "-w, --width <width>",
    "With in pixel of the scans (default: 2481)",
  );
  command.option(
    "-h, --height <height>",
    "Height in pixel of the scans (default: 3507)",
  );
  command.option(
    "-s, --paperless-post-document-url <paperless_post_document_url>",
    "The paperless post document url (example: https://domain.tld/api/documents/post_document/)",
  );

  command.option(
    "-o, --paperless-token <paperless_token>",
    "The paperless token",
  );
  command.option(
    "--paperless-group-multi-page-scan-into-a-pdf",
    "Combine multiple scanned images into a single PDF document",
  );
  command.option(
    "--paperless-always-send-as-pdf-file",
    "Always convert scan job to pdf before sending to paperless",
  );
  command.option(
    "-k, --keep-files",
    "Keep the scan files on the file system (default: false)",
  );

  command.option(
    "--nextcloud-url <nextcloud_url>",
    "The nextcloud url (example: https://domain.tld)",
  );
  command.option(
    "--nextcloud-username <nextcloud_username>",
    "The nextcloud username",
  );
  command.option(
    "--nextcloud-password <nextcloud_app_password>",
    "The nextcloud app password for username. Either this or nextcloud-password-file is required",
  );
  command.option(
    "--nextcloud-password-file <nextcloud_app_password_file>",
    "File name that contains the nextcloud app password for username. Either this or nextcloud-password is required",
  );
  command.option(
    "--nextcloud-upload-folder <nextcloud_upload_folder>",
    "The upload folder where documents or images are uploaded (default: scan)",
  );
  return command;
}

function setupParameterOpts(command: Command): Command {
  command.option(
    "-a, --address <ip>",
    "IP address of the device (this overrides -p)",
  );
  command.option(
    "--device-up-polling-interval <deviceUpPollingInterval>",
    "Device up polling interval in milliseconds",
    parseFloat,
  );
  command.option(
    "-n, --name <name>",
    "Name of the device for service discovery",
  ); // i.e. 'Deskjet 3520 series'

  command.option("-D, --debug", "Enable debug");
  return command;
}

async function getDeviceIp(options: OptionValues) {
  let ip = options.address || getConfig("ip");
  if (!ip) {
    const name = options.name || getConfig("name");
    ip = await findOfficejetIp(name || "HP Smart Tank Plus 570 series");
  }
  console.log(`Using device ip: ${ip}`);
  return ip;
}

function getIsDebug(options: OptionValues) {
  const debug =
    options.debug != null ? true : getConfig<boolean>("debug") || false;

  if (debug) {
    console.log(`IsDebug: ${debug}`);
  }
  return debug;
}

function getPaperlessConfig(
  parentOption: OptionValues,
): PaperlessConfig | undefined {
  const paperlessPostDocumentUrl: string =
    parentOption.paperlessPostDocumentUrl ||
    getConfig("paperless_post_document_url");
  const configPaperlessToken: string =
    parentOption.paperlessToken || getConfig("paperless_token");

  if (paperlessPostDocumentUrl && configPaperlessToken) {
    const configPaperlessKeepFiles: boolean =
      parentOption.keepFiles || getConfig("keep_files") || false;
    const groupMultiPageScanIntoAPdf: boolean =
      parentOption.paperlessGroupMultiPageScanIntoAPdf ||
      getConfig("paperless_group_multi_page_scan_into_a_pdf") ||
      false;
    const alwaysSendAsPdfFile: boolean =
      parentOption.paperlessAlwaysSendAsPdfFile ||
      getConfig("paperless_always_send_as_pdf_file") ||
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
  parentOption: OptionValues,
): NextcloudConfig | undefined {
  const configNextcloudUrl: string =
    parentOption.nextcloudUrl || getConfig("nextcloud_url");
  const configNextcloudUsername: string =
    parentOption.nextcloudUsername || getConfig("nextcloud_username");
  let configNextcloudPassword: string =
    parentOption.nextcloudPassword || getConfig("nextcloud_password");
  const configNextcloudPasswordFile: string =
    parentOption.nextcloudPasswordFile || getConfig("nextcloud_password_file");

  if (
    configNextcloudUrl &&
    configNextcloudUsername &&
    (configNextcloudPassword || configNextcloudPasswordFile)
  ) {
    const configNextcloudUploadFolder =
      parentOption.nextcloudUploadFolder ||
      getConfig("nextcloud_upload_folder") ||
      "scan";
    const configNextcloudKeepFiles: boolean =
      parentOption.keepFiles || getConfig("keep_files") || false;

    if (configNextcloudPasswordFile) {
      configNextcloudPassword = fs
        .readFileSync(configNextcloudPasswordFile, "utf8")
        .trimEnd();
    }

    console.log(
      `Nextcloud configuration provided, url: ${configNextcloudUrl}, username: ${configNextcloudUsername}, password length: ${configNextcloudPassword.length}, upload folder: ${configNextcloudUploadFolder}, keepFiles: ${configNextcloudKeepFiles}`,
    );
    return {
      baseUrl: configNextcloudUrl,
      username: configNextcloudUsername,
      password: configNextcloudPassword,
      uploadFolder: configNextcloudUploadFolder,
      keepFiles: configNextcloudKeepFiles,
    };
  } else {
    return undefined;
  }
}

function getHealthCheckSetting(option: OptionValues) {
  const healthCheckEnabled: boolean =
    option.healthCheck || getConfig("enableHealthCheck") === true;
  let healthCheckPort: number;
  if (option.healthCheckPort) {
    healthCheckPort = parseInt(option.healthCheckPort, 10);
  } else {
    healthCheckPort = getConfig<number>("healthCheckPort") || 3000;
  }
  return {
    isHealthCheckEnabled: healthCheckEnabled,
    healthCheckPort: healthCheckPort,
  };
}

function getScanConfiguration(option: OptionValues) {
  const directoryConfig: DirectoryConfig = {
    directory: option.directory || getConfig("directory"),
    tempDirectory: option.tempDirectory || getConfig("tempDirectory"),
    filePattern: option.pattern || getConfig("pattern"),
  };

  const configWidth = (option.width || getConfig("width") || 0).toString();
  const width =
    configWidth.toLowerCase() === "max"
      ? Number.MAX_SAFE_INTEGER
      : parseInt(configWidth, 10);

  const configHeight = (option.height || getConfig("height") || 0).toString();
  const height =
    configHeight.toLowerCase() === "max"
      ? Number.MAX_SAFE_INTEGER
      : parseInt(configHeight, 10);

  const paperlessConfig = getPaperlessConfig(option);
  const nextcloudConfig = getNextcloudConfig(option);

  const scanConfig: ScanConfig = {
    resolution: parseInt(
      option.resolution || getConfig("resolution") || "200",
      10,
    ),
    width: width,
    height: height,
    directoryConfig,
    paperlessConfig,
    nextcloudConfig,
  };
  return scanConfig;
}

function getDeviceUpPollingInterval(parentOption: OptionValues) {
  return (
    parentOption.deviceUpPollingInterval ||
    getConfig("deviceUpPollingInterval") ||
    1000
  );
}

async function main() {
  setupParameterOpts(program);
  const cmdListen = program.createCommand("listen");
  setupScanParameters(cmdListen)
    .description("Listen the device for new scan job to save to this target")
    .option(
      "-l, --label <label>",
      "The label to display on the device (the default is the hostname)",
    )
    .addOption(
      new Option("--health-check", "Start an http health check endpoint"),
    )
    .addOption(
      new Option(
        "--health-check-port <health-check-port>",
        "Start an http health check endpoint",
      ),
    )
    .action(async (options, cmd) => {
      const parentOption = cmd.parent.opts();

      const ip = await getDeviceIp(parentOption);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(parentOption);
      HPApi.setDebug(isDebug);

      const registrationConfig: RegistrationConfig = {
        label: options.label || getConfig("label") || os.hostname(),
      };

      const deviceUpPollingInterval = getDeviceUpPollingInterval(parentOption);

      const healthCheckSetting = getHealthCheckSetting(options);
      if (healthCheckSetting.isHealthCheckEnabled) {
        startHealthCheckServer(healthCheckSetting.healthCheckPort);
      }

      const scanConfig = getScanConfiguration(options);

      await listenCmd(registrationConfig, scanConfig, deviceUpPollingInterval);
    });
  program.addCommand(cmdListen, { isDefault: true });

  const cmdAdfAutoscan = program.createCommand("adf-autoscan");
  setupScanParameters(cmdAdfAutoscan)
    .addOption(
      new Option("--duplex", "If specified, the scan will be in duplex"),
    )
    .addOption(
      new Option(
        "--pdf",
        "If specified, the scan result will be a pdf document, the default is multiple jpeg files",
      ),
    )
    .addOption(
      new Option(
        "--pollingInterval <pollingInterval>",
        "Time interval in millisecond between each lookup for content in the automatic document feeder",
      ),
    )
    .description(
      "Automatically trigger a new scan job to this target once paper is detected in the automatic document feeder (adf)",
    )
    .addOption(
      new Option(
        "--start-scan-delay <startScanDelay>",
        "Once document are detected to be in the adf, this specify the wait delay in millisecond before triggering the scan",
      ),
    )
    .addOption(
      new Option("--health-check", "Start an http health check endpoint"),
    )
    .addOption(
      new Option(
        "--health-check-port <port>",
        "Start an http health check endpoint",
      ),
    )
    .description(
      "Automatically trigger a new scan job to this target once paper is detected in the automatic document feeder (adf)",
    )
    .action(async (options, cmd) => {
      const parentOption = cmd.parent.opts();

      const ip = await getDeviceIp(parentOption);
      HPApi.setDeviceIP(ip);

      const isDebug = getIsDebug(parentOption);
      HPApi.setDebug(isDebug);

      const deviceUpPollingInterval = getDeviceUpPollingInterval(parentOption);

      const healthCheckSetting = getHealthCheckSetting(options);
      if (healthCheckSetting.isHealthCheckEnabled) {
        startHealthCheckServer(healthCheckSetting.healthCheckPort);
      }

      const scanConfig = getScanConfiguration(options);

      const adfScanConfig: AdfAutoScanConfig = {
        ...scanConfig,
        isDuplex: options.isDuplex || getConfig("autoscan_duplex") || false,
        generatePdf: options.pdf || getConfig("autoscan_pdf") || false,
        pollingInterval:
          options.pollingInterval ||
          getConfig("autoscan_pollingInterval") ||
          1000,
        startScanDelay:
          options.startScanDelay ||
          getConfig("autoscan_startScanDelay") ||
          5000,
      };

      await adfAutoscanCmd(adfScanConfig, deviceUpPollingInterval);
    });
  program.addCommand(cmdAdfAutoscan);

  const cmdClearRegistrations = program.createCommand("clear-registrations");
  cmdClearRegistrations
    .description("Clear the list or registered target on the device")
    .action(async (options, cmd) => {
      await clearRegistrationsCmd(cmd);
    });
  program.addCommand(cmdClearRegistrations);

  await program.parseAsync(process.argv);
}

console.log(`Current commit ID: ${commitInfo.commitId}`);
main().catch((err) => console.log(err));
