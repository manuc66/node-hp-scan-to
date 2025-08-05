# node-hp-scan-to

![build](https://github.com/manuc66/node-hp-scan-to/actions/workflows/docker-image.yml/badge.svg)
[![Build Status](https://app.travis-ci.com/manuc66/node-hp-scan-to.svg?branch=master)](https://app.travis-ci.com/manuc66/node-hp-scan-to)
![npm](https://img.shields.io/npm/v/node-hp-scan-to)
[![npm](https://img.shields.io/npm/dt/node-hp-scan-to)](https://www.npmjs.com/package/node-hp-scan-to)
[![Docker Pulls](https://img.shields.io/docker/pulls/manuc66/node-hp-scan-to)](https://hub.docker.com/repository/docker/manuc66/node-hp-scan-to)
[![Gitter](https://badges.gitter.im/node-hp-scan-to/community.svg)](https://gitter.im/node-hp-scan-to/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![CodeFactor](https://www.codefactor.io/repository/github/manuc66/node-hp-scan-to/badge)](https://www.codefactor.io/repository/github/manuc66/node-hp-scan-to)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to?ref=badge_shield)

**`node-hp-scan-to`** is a Node.js application that replicates HP's "_Scan to Computer_" functionality by [reverse engineering](protocol_doc/HP%20Officejet%206500%20E710n-z.md) the original protocol, allowing you to scan documents directly from your HP printer's scanner to your Linux, Windows, or macOS computer.

Unlike the original HP program, `node-hp-scan-to` is cross-platform and can be run on a bare-metal desktop or server, or in a container on Docker or Kubernetes. It can also be integrated with third-party document management solutions such as [Paperless-ngx](https://docs.paperless-ngx.com/) and [Nextcloud](https://Nextcloud.com/).

**Disclaimer:** _This project is neither endorsed by nor affiliated with Hewlett-Packard (HP). Any mention or reference to HP is purely descriptive and non-commercial. All reverse engineering of HP's official Windows application and its interaction with devices has been performed independently without cooperation from HP. __This software is provided as-is for educational and personal use only__._


<!-- TOC -->

- [Features](#features)
  - [Supported Devices](#supported-devices)
  - [Supported Functions](#supported-functions)
  - [App Features](#app-features)
- [Installation](#installation)
  - [Using NodeJS](#using-nodejs)
  - [Using Docker](#using-docker)
- [Usage](#usage)
  - [Command Line (CLI)](#command-line-cli)
    - [CLI Options](#cli-options)
    - [CLI Commands](#cli-commands)
  - [Run with Docker](#run-with-docker)
    - [Public Pre-Built Docker image](#public-pre-built-docker-image)
    - [Docker Environment Variables](#docker-environment-variables)
    - [Example for Docker](#example-for-docker)
    - [Example for Docker Compose](#example-for-docker-compose)
  - [Run with Kubernetes](#run-with-kubernetes)
  - [Configure](#Configure)
- [Build Source Code](#build-source-code)
  - [Debugging](#debugging)
- [💖 Support this project](#-support-this-project)
- [🙏 Special Thanks](#-special-thanks)
- [License](#license)

<!-- /TOC -->

## Features

### Supported Devices

This app has been developed and tested with the following HP All-in-One Printers:

- HP DeskJet 3520
- HP OfficeJet 6500A Plus
- HP Smart Tank Plus 570 series
- HP OfficeJet Pro 9019e

Users have reported it also working on:

- HP DeskJet 3050 (J610a),3522, 3775, 4670, 5525
- HP Envy 4504, 4520, 5530, 7640
- HP OfficeJet 250 Mobile, 3830, 5230, 5740, 6700 Premium, 6950, Pro 7730, 8010 series, 8025e, 9012e
- HP PageWide 377dw MFP

There is a good chance it also works on other unlisted HP All-in-One Printer.

### Supported Functions

- ✔️ JPG and PDF document scan output
- ✔️ Automatic document feeder (ADF) support with dual-side scanning
- ✔️ Multi-page platen scanning
- ✔️ Automatic IP address discovery

### App Features

- ✔️ Multi-platform: Linux, Windows, and macOS
- ✔️ Prebuilt Docker images (multi-architecture)
- ✔️ Command line (CLI) support
- ✔️ Customizable file names, resolutions, and device labels
- ✔️ Clear all registered targets
- ✔️ Emulated double side scan
- ✔️ Multiple output target support:
  - Local folders
  - [Paperless-ngx API](https://docs.paperless-ngx.com/api/) upload
  - [Nextcloud WebDAV](https://docs.Nextcloud.com/server/latest/user_manual/en/files/access_webdav.html) upload
 
### Emulated Duplex Scanning Feature

The emulated duplex scanning feature allows users to efficiently scan both sides of a document, even on devices that do not natively support duplex scanning.

When enabled (as an opt-in feature), it adds an extra entry in the list of scan destinations, labeled with the "duplex" suffix. When you select this option for the first time, the device scans the front side of the document.

After the front side is scanned, if you choose the duplex option again, the device will trigger a second scan and produce an assembled output.

If you decide not to scan the back side immediately, the front side scan will be saved in the system and will remain there until you either scan the back side or perform a single side scan instead.

## Installation

### Using NodeJS

- You must have [NodeJS installed](https://nodejs.org/en/download)

- In a Terminal, run: `npm install node-hp-scan-to`

### Using Docker

- You must have [Docker installed](https://www.docker.com/get-started/)

- In a Terminal, run: `docker run -d -e IP="IP_ADDRESS_OF_PRINTER" -e PGID=1000 -e PUID=1000 docker.io/manuc66/node-hp-scan-to`

- For more Docker options, see the [Run with Docker](#run-with-docker) section

- For running with Docker Compose, see the [Example for Docker Compose](#example-for-docker-compose) section

### Using Arch Linux (AUR)

- The package is available in the Arch User Repository (AUR) as `node-hp-scan-to`

- Install it using your preferred AUR helper, for example:
  ```bash
  yay -S node-hp-scan-to
  ```
  or
  ```bash
  paru -S node-hp-scan-to
  ```

## Usage

### Command Line (CLI)

Running the app with NodeJS using the `npx` command:

`npx node-hp-scan-to`

Main options:

- `-a, --address <ip>`: Printer IP (e.g., `192.168.0.5`)
- `-d, --directory <path>`: Save scans to (e.g., `~/scans`)

Example usage:

`npx node-hp-scan-to -a 192.168.0.5 -d ~/scans`

#### CLI Options

Run `npx node-hp-scan-to --help` to see the full list of options below:

| Option                          | Description                                                                                                      | Example/Default                                      |
|---------------------------------|------------------------------------------------------------------------------------------------------------------|------------------------------------------------------|
| `-a`, `--address`               | Printer IP address.                                                                                              | `-a 192.168.0.5` (no default)                        |
| `-d`, `--directory`             | Directory to save scanned documents. Defaults to `/tmp/scan-to-pc<random value>` if not set.                     | `-d /tmp/scan-to-pc1234`                             |
| `-D`, `--debug`                 | Enable debug logging.                                                                                            | `-D` (disabled by default)                          |
| `-h`, `--height`                | Scan height in pixels. Defaults to 3507.                                                                         | `-h 3507`                                            |
| `-k`, `--keep-files`            | Retain scanned files after uploading to Paperless-ngx or Nextcloud (disabled by default).                        | `-k` (disabled by default)                          |
| `-l`, `--label`                 | The name of the computer running this app. Defaults to the hostname.                                             | `-l <hostname>` (default: system hostname)           |
| `-n`, `--name`                  | Printer name (quote if it contains spaces).                                                                      | `-n "Officejet 6500 E710n-z"` (no default)           |
| `-o`, `--paperless-token`       | Paperless-ngx API token.                                                                                         | `-o xxxxxxxxxxxx` (no default)                      |
| `-p`, `--pattern`               | Filename pattern (no extension). Use quotes for static text, supports date/time masks (see [dateformat docs](https://www.npmjs.com/package/dateformat#mask-options)). Defaults to `scan<increasing number>_page<page number>`. | `-p scan1_page1`                                    |
| `-r`, `--resolution`            | Scan resolution in DPI. Defaults to 200.                                                                         | `-r 200`                                             |
| `-s`, `--paperless-post-document-url` | Paperless-ngx API URL for uploading documents.                                                             | `-s https://domain.tld/api/documents/post_document/` (no default) |
| `-t`, `--temp-directory`        | Temporary directory for processing. Defaults to `/tmp/scan-to-pc<random value>` if not set.                      | `-t /tmp/scan-to-pc5678`                             |
| `-w`, `--width`                 | Scan width in pixels. Defaults to 2481.                                                                          | `-w 2481`                                            |
| `--device-up-polling-interval`  | Polling interval (in milliseconds) to check if the printer is online.                                            | `--device-up-polling-interval 5000` (no default)     |
| `--nextcloud-password`          | Nextcloud app password. Required unless `--nextcloud-password-file` is used. Overrides if both are provided.     | `--nextcloud-password mypassword` (no default)      |
| `--nextcloud-password-file`     | File containing the Nextcloud app password. Required unless `--nextcloud-password` is used. Takes precedence if both are provided. | `--nextcloud-password-file /path/to/file` (no default) |
| `--nextcloud-upload-folder`     | Nextcloud folder for uploads. Defaults to `scan`.                                                                | `--nextcloud-upload-folder scan`                    |
| `--nextcloud-url`               | Nextcloud instance URL.                                                                                          | `--nextcloud-url https://domain.tld` (no default)   |
| `--nextcloud-username`          | Nextcloud username with write access to the upload folder.                                                       | `--nextcloud-username user` (no default)            |

**Notes:**

- Date/time patterns for `--pattern` follow the [dateformat](https://www.npmjs.com/package/dateformat) library’s “Mask options” section.

- Defaults like `/tmp/scan-to-pc<random value>` include a random suffix in practice (e.g., `/tmp/scan-to-pc1234`).

#### CLI Commands

##### `listen`

By default, this app runs the `listen` command as the default mode. It will listen to the print for new job and trigger based on the selection on the device.

Run `npx node-hp-scan-to listen --help` to get the full list of command options.

<!-- BEGIN HELP command: listen -->
```text
Usage:  listen [options]

Listen the device for new scan job to save to this target

Output Options:
  -d, --directory <dir>                                            Directory where scans are saved (default: /tmp/scan-to-pcRANDOM)
  -p, --pattern <pattern>                                          Pattern for filename (i.e. "scan"_dd.mm.yyyy_hh:MM:ss, default would be scanPageNUMBER), make sure that the pattern is enclosed in extra quotes
  -k, --keep-files                                                 Keep the scan files on the file system when sent to external systems for local backup and easy access (default: false)

Scan Options:
  -r, --resolution <dpi>                                           Resolution in DPI of the scans (default: 200)
  -w, --width <width>                                              Width in pixels of the scans (default: max)
  -h, --height <height>                                            Height in pixels of the scans (default: max)
  -t, --temp-directory <dir>                                       Temp directory used for processing (default: /tmp/scan-to-pcRANDOM)
  --prefer-eSCL                                                    Prefer eSCL protocol if available

Options:
  --device-up-polling-interval <deviceUpPollingInterval>           Device up polling interval in milliseconds
  --help                                                           display help for command

Paperless Options:
  -s, --paperless-post-document-url <paperless_post_document_url>  The paperless post document url (example: https://domain.tld/api/documents/post_document/)
  -o, --paperless-token <paperless_token>                          The paperless token
  --paperless-group-multi-page-scan-into-a-pdf                     Combine multiple scanned images into a single PDF document
  --paperless-always-send-as-pdf-file                              Always convert scan job to pdf before sending to paperless

Nextcloud Options:
  --nextcloud-url <nextcloud_url>                                  The nextcloud url (example: https://domain.tld)
  --nextcloud-username <nextcloud_username>                        The nextcloud username
  --nextcloud-password <nextcloud_app_password>                    The nextcloud app password for username. Either this or nextcloud-password-file is required
  --nextcloud-password-file <nextcloud_app_password_file>          File name that contains the nextcloud app password for username. Either this or nextcloud-password is required
  --nextcloud-upload-folder <nextcloud_upload_folder>              The upload folder where documents or images are uploaded (default: scan)

Device Control Screen Options:
  -l, --label <label>                                              The label to display on the device (the default is the hostname)
  --add-emulated-duplex                                            Enable emulated duplex scanning
  --emulated-duplex-label <label>                                  The emulated duplex label to display on the device (the default is to suffix the main label with duplex)

Global Options:
  -a, --address <ip>                                               IP address of the device, when specified, the ip will be used instead of the name
  -n, --name <name>                                                Name of the device to lookup for on the network
  -D, --debug                                                      Enable debug
  --health-check                                                   Start an http health check endpoint
  --health-check-port <health-check-port>                          Define the port for the HTTP health check endpoint
```
<!-- END HELP command: listen -->

##### `adf-autoscan`

Running `npx node-hp-scan-to adf-autoscan` will automatically trigger a scan job as soon as the ADF (automatic document feeder) on the printer's scanner is loaded with paper.

You can also set the environment variable `MAIN_COMMAND="adf-autoscan"` with Docker. Example:

```sh
docker run -e MAIN_COMMAND="adf-autoscan" -e CMDLINE=--debug docker.io/manuc66/node-hp-scan-to:latest
```

Run `npx node-hp-scan-to adf-autoscan --help` to get command line usage help.

<!-- BEGIN HELP command: adf-autoscan -->
```text
Usage:  adf-autoscan [options]

Automatically trigger a new scan job to this target once paper is detected in
the automatic document feeder (adf)

Output Options:
  -d, --directory <dir>                                            Directory where scans are saved (default: /tmp/scan-to-pcRANDOM)
  -p, --pattern <pattern>                                          Pattern for filename (i.e. "scan"_dd.mm.yyyy_hh:MM:ss, default would be scanPageNUMBER), make sure that the pattern is enclosed in extra quotes
  -k, --keep-files                                                 Keep the scan files on the file system when sent to external systems for local backup and easy access (default: false)
  --pdf                                                            If specified, the scan result will always be a pdf document, the default depends on the device choice

Scan Options:
  -r, --resolution <dpi>                                           Resolution in DPI of the scans (default: 200)
  -w, --width <width>                                              Width in pixels of the scans (default: max)
  -h, --height <height>                                            Height in pixels of the scans (default: max)
  -t, --temp-directory <dir>                                       Temp directory used for processing (default: /tmp/scan-to-pcRANDOM)
  --prefer-eSCL                                                    Prefer eSCL protocol if available
  --duplex                                                         If specified, all the scans will be in duplex if the device support it

Options:
  --device-up-polling-interval <deviceUpPollingInterval>           Device up polling interval in milliseconds
  --help                                                           display help for command

Paperless Options:
  -s, --paperless-post-document-url <paperless_post_document_url>  The paperless post document url (example: https://domain.tld/api/documents/post_document/)
  -o, --paperless-token <paperless_token>                          The paperless token
  --paperless-group-multi-page-scan-into-a-pdf                     Combine multiple scanned images into a single PDF document
  --paperless-always-send-as-pdf-file                              Always convert scan job to pdf before sending to paperless

Nextcloud Options:
  --nextcloud-url <nextcloud_url>                                  The nextcloud url (example: https://domain.tld)
  --nextcloud-username <nextcloud_username>                        The nextcloud username
  --nextcloud-password <nextcloud_app_password>                    The nextcloud app password for username. Either this or nextcloud-password-file is required
  --nextcloud-password-file <nextcloud_app_password_file>          File name that contains the nextcloud app password for username. Either this or nextcloud-password is required
  --nextcloud-upload-folder <nextcloud_upload_folder>              The upload folder where documents or images are uploaded (default: scan)

Auto-scan Options:
  --pollingInterval <pollingInterval>                              Time interval in millisecond between each lookup for content in the automatic document feeder
  --start-scan-delay <startScanDelay>                              Once document are detected to be in the adf, this specify the wait delay in millisecond before triggering the scan

Global Options:
  -a, --address <ip>                                               IP address of the device, when specified, the ip will be used instead of the name
  -n, --name <name>                                                Name of the device to lookup for on the network
  -D, --debug                                                      Enable debug
  --health-check                                                   Start an http health check endpoint
  --health-check-port <health-check-port>                          Define the port for the HTTP health check endpoint
```
<!-- END HELP command: adf-autoscan -->

##### `clear-registrations`

Running `npx node-hp-scan-to clear-registratons` will clear all registered targets on the device (useful for trial and error and debugging).

Run `npx node-hp-scan-to clear-registrations --help` to get command line usage help.

You can also set the environment variable `MAIN_COMMAND="clear-registrations"` with Docker. Example:

```sh
docker run -e MAIN_COMMAND="clear-registrations" docker.io/manuc66/node-hp-scan-to:latest
```

<!-- BEGIN HELP command: clear-registrations -->
```text
Usage:  clear-registrations [options]

Clear the list or registered target on the device

Options:
  -h, --help                               display help for command

Global Options:
  -a, --address <ip>                       IP address of the device, when specified, the ip will be used instead of the name
  -n, --name <name>                        Name of the device to lookup for on the network
  -D, --debug                              Enable debug
  --health-check                           Start an http health check endpoint
  --health-check-port <health-check-port>  Define the port for the HTTP health check endpoint
```
<!-- END HELP command: clear-registrations -->

##### `single-scan`

Running `npx node-hp-scan-to single-scan` will directly issue a single scan job

Run `npx node-hp-scan-to single-scan --help` to get command line usage help.

You can also set the environment variable `MAIN_COMMAND="single-scan"` with Docker. Example:

```sh
docker run -e MAIN_COMMAND="single-scan" docker.io/manuc66/node-hp-scan-to:latest
```

<!-- BEGIN HELP command: single-scan -->
```text
Usage:  single-scan [options]

Trigger a new scan job

Output Options:
  -d, --directory <dir>                                            Directory where scans are saved (default: /tmp/scan-to-pcRANDOM)
  -p, --pattern <pattern>                                          Pattern for filename (i.e. "scan"_dd.mm.yyyy_hh:MM:ss, default would be scanPageNUMBER), make sure that the pattern is enclosed in extra quotes
  -k, --keep-files                                                 Keep the scan files on the file system when sent to external systems for local backup and easy access (default: false)
  --pdf                                                            If specified, the scan result will always be a pdf document, the default depends on the device choice

Scan Options:
  -r, --resolution <dpi>                                           Resolution in DPI of the scans (default: 200)
  -w, --width <width>                                              Width in pixels of the scans (default: max)
  -h, --height <height>                                            Height in pixels of the scans (default: max)
  -t, --temp-directory <dir>                                       Temp directory used for processing (default: /tmp/scan-to-pcRANDOM)
  --prefer-eSCL                                                    Prefer eSCL protocol if available
  --duplex                                                         If specified, all the scans will be in duplex if the device support it

Options:
  --device-up-polling-interval <deviceUpPollingInterval>           Device up polling interval in milliseconds
  --help                                                           display help for command

Paperless Options:
  -s, --paperless-post-document-url <paperless_post_document_url>  The paperless post document url (example: https://domain.tld/api/documents/post_document/)
  -o, --paperless-token <paperless_token>                          The paperless token
  --paperless-group-multi-page-scan-into-a-pdf                     Combine multiple scanned images into a single PDF document
  --paperless-always-send-as-pdf-file                              Always convert scan job to pdf before sending to paperless

Nextcloud Options:
  --nextcloud-url <nextcloud_url>                                  The nextcloud url (example: https://domain.tld)
  --nextcloud-username <nextcloud_username>                        The nextcloud username
  --nextcloud-password <nextcloud_app_password>                    The nextcloud app password for username. Either this or nextcloud-password-file is required
  --nextcloud-password-file <nextcloud_app_password_file>          File name that contains the nextcloud app password for username. Either this or nextcloud-password is required
  --nextcloud-upload-folder <nextcloud_upload_folder>              The upload folder where documents or images are uploaded (default: scan)

Global Options:
  -a, --address <ip>                                               IP address of the device, when specified, the ip will be used instead of the name
  -n, --name <name>                                                Name of the device to lookup for on the network
  -D, --debug                                                      Enable debug
  --health-check                                                   Start an http health check endpoint
  --health-check-port <health-check-port>                          Define the port for the HTTP health check endpoint
```
<!-- END HELP command: single-scan -->

### Run with Docker

#### Public Pre-Built Docker image

<https://hub.docker.com/repository/docker/manuc66/node-hp-scan-to>

The Docker images follow semantic versioning:
- `latest`: Latest stable release (includes all patch updates)
- `x.y.z`: Specific version (e.g., `1.2.3`)
- `x.y`: Latest patch version of a specific minor version (e.g., `1.2`)
- `x`: Latest minor.patch version of a specific major version (e.g., `1`)
- `master`: Latest build from the master branch (development version)

Note: For most users, the `latest` tag is recommended as it includes all patch updates and bug fixes.

Be aware that with Docker you have to specify the IP address of the printer via the `IP` environment variable, because the Bonjour service discovery protocol uses multicast network traffic, which by default doesn't work in Docker.

You could however use Docker's [macvlan](https://docs.docker.com/engine/network/drivers/macvlan/) networking, this way you can use service discovery and the `NAME` environment variable.

All scanned files are written to the volume `/scan`, the filename can be changed with the `PATTERN` environment variable. For the correct permissions to the volume set the environment variables `PUID` and `PGID` to that of the user running the container (usually `PUID=1000` and `PGID=1000`).

#### Docker Environment Variables

List of supported environment variables and their meaning, or correspondence with [command-line flags](#cli-options):

| Environment Variable            | Description                                                                                              | Corresponding CLI Flag or Notes                                                                                   |
|---------------------------------|----------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `CMDLINE`                       | Additional command-line flags added at the end of the command                                            | Set to `-D` to enable debug logs                                                                                |
| `DIR`                           | Directory to use                                                                                         | `-d` / `--directory`                                                                                            |
| `IP`                            | IP address for the program                                                                               | `-a` / `--address`                                                                                              |
| `KEEP_FILES`                    | If set, scanned files are not deleted after uploading to Paperless-ngx or Nextcloud                      |                                                                                                                  |
| `LABEL`                         | Label to apply                                                                                           | `-l` / `--label`                                                                                                |
| `NAME`                          | Name to set                                                                                              | `-n` / `--name`                                                                                                 |
| `NEXTCLOUD_PASSWORD`            | Password of Nextcloud user (either this or `NEXTCLOUD_PASSWORD_FILE` is required; file takes precedence) |                                                                                                                  |
| `NEXTCLOUD_PASSWORD_FILE`       | File containing Nextcloud user password (either this or `NEXTCLOUD_PASSWORD` is required; takes precedence) | Example: `./nextcloud_password.secret` (preferred for Docker Compose secrets)                                   |
| `NEXTCLOUD_UPLOAD_FOLDER`       | Upload folder for documents or images (user must have write permission; defaults to `scan` if not set)   |                                                                                                                  |
| `NEXTCLOUD_URL`                 | Nextcloud URL                                                                                            | Example: `https://nextcloud.example.tld`                                                                        |
| `NEXTCLOUD_USERNAME`            | Nextcloud username                                                                                       |                                                                                                                  |
| `PAPERLESS_POST_DOCUMENT_URL`   | Paperless-ngx post document URL (if provided with token, a PDF is uploaded)                              | Example: `http://<paperless-host>:<port>/api/documents/post_document/`                                          |
| `PAPERLESS_TOKEN`               | Paperless-ngx API token                                                                                  | Example: `xxxxxxxxxxxx...`                                                                                      |
| `PATTERN`                       | Pattern to use                                                                                           | `-p` / `--pattern`                                                                                              |
| `PGID`                          | ID of the group that will run the program                                                                |                                                                                                                  |
| `PUID`                          | ID of the user that will run the program                                                                 |                                                                                                                  |
| `RESOLUTION`                    | Resolution setting                                                                                       | `-r` / `--resolution`                                                                                           |
| `TEMP_DIR`                      | Temporary directory                                                                                      | `-t` / `--temp-directory`                                                                                       |

**Additional Notes:**

- The name shown on the printer’s display is the hostname of the Docker container, which defaults to a random value. You can override it by setting the `hostname` or using the `LABEL` environment variable.

- To enable debug logs set the environment variable `CMDLINE` to `-D`

#### Example for Docker

To build a local Docker image from this repo:

```sh
git clone https://github.com/manuc66/node-hp-scan-to.git
cd node-hp-scan-to
docker build . -t node-hp-scan-to
docker run -e IP=192.168.0.5 -e PGID=1000 -e PUID=1000 --hostname myComputer node-hp-scan-to
```

#### Example for Docker Compose

Create the following `docker-compose.yml` file into this directory:

```yml
services:
  node-hp-scan-to:
    image: docker.io/manuc66/node-hp-scan-to:latest
    restart: unless-stopped
    hostname: node-hp-scan-to
    environment:
      # REQUIRED - Change the next line to the IP address of your HP printer/scanner:
      - IP=192.168.0.5
      # Name that your container will appear as to your printer:
      - LABEL=node-hp-scan-to
      # Set the timezone, such as "Europe/London":
      - TZ=UTC
      # Set the created filename pattern:
      - PATTERN="scan"_dd-mm-yyyy_hh-MM-ss
      # Run the Docker container as the same user ID as the host system:
      - PGID=1000
      - PUID=1000
      # Optional - enable autoscanning a document when loaded into the scanner:
      # - MAIN_COMMAND=adf-autoscan
      # If you need to pass additional configuration flag use the CMDLINE env, thy will be appened to the
      # - CMDLINE=--debug --pdf
      # If using Paperless-ngx, you can use its API to upload files:
      # - PAPERLESS_POST_DOCUMENT_URL=http://<paperless-host>:<port>/api/documents/post_document/
      # - PAPERLESS_TOKEN= xxxxxxxxxxxx...
    volumes:
      - ./scan:/scan
```

Then run `docker-compose up -d`

### Run with Kubernetes

Apply the following manifest (the `PersistentVolumeClaim` must also be deployed beforehand):

```yml
apiVersion: apps/v1
kind: Deployment
name: hp-scan-to
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: hp-scan-to
  template:
    metadata:
      labels:
        app.kubernetes.io/name: hp-scan-to
    spec:
      containers:
        - image: manuc66/node-hp-scan-to:master
          name: hp-scan-to
          env:
          - name: IP
            value: 192.168.0.5
          - name: PATTERN
            value: '"scan"_dd.mm.yyyy_hh:MM:ss'
          - name: PGID
            value: "1000"
          - name: PUID
            value: "1000"
          - name: LABEL
            value: scan
          - name: DIR
            value: /scans
          - name: TZ
            value: Europe/London
          resources:
            limits:
              memory: 256Mi
            requests:
              cpu: "0"
              memory: 64Mi
          volumeMounts:
            - mountPath: /scans
              name: incoming-scans
      restartPolicy: Always
      volumes:
        - name: incoming-scans
          persistentVolumeClaim:
            claimName: incoming-scans
```

### Configure

Configuration can be done in a config file instead of using command line switches or environment variables in docker. The schema of the configuration file can be found in [FileConfig](src/type/FileConfig.ts)

The configuration file is handled by https://www.npmjs.com/package/config

## Build Source Code

How to build and run the project's source code:

```sh
git clone https://github.com/manuc66/node-hp-scan-to.git
cd node-hp-scan-to
yarn install -d
yarn build
# Start the program with the printer's IP address:
node dist/index.js -a 192.168.1.5 
# Or start it with the name of the printer:
# node dist/index.js -n "Officejet 6500 E710n-z"
```

### Debugging

I'm using Visual Studio Code to debug this application, so instead of running _ts-node_, just run `code .` and press F5 to start debugging.

You may want to set your printers ip or name in `.vscode/launch.json`

## 💖 Support this project

Thank you so much to everyone who has already supported this project! Your generosity is greatly appreciated, and it motivates me to keep improving and maintaining this project.

If this project has helped you save money or time, or simply made your life easier, you can support me by buying me a cup of coffee:

- [![Support via PayPal](https://cdn.rawgit.com/twolfson/paypal-github-button/1.0.0/dist/button.svg)](https://www.paypal.me/manuc66)
- Bitcoin — You can send me bitcoins at this address: `33gxVjey6g4Beha26fSQZLFfWWndT1oY3F`

Thank you for your support!

## 🙏 Special Thanks

A special thank you to [JetBrains](https://www.jetbrains.com/) for supporting this project with a free license for their amazing development tools. Their support helps make this project possible.

## License

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to?ref=badge_large)
