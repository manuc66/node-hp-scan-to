# node-hp-scan-to

![build](https://github.com/manuc66/node-hp-scan-to/actions/workflows/docker-image.yml/badge.svg)
[![Build Status](https://app.travis-ci.com/manuc66/node-hp-scan-to.svg?branch=master)](https://app.travis-ci.com/manuc66/node-hp-scan-to)
![npm](https://img.shields.io/npm/v/node-hp-scan-to)
[![npm](https://img.shields.io/npm/dt/node-hp-scan-to)](https://www.npmjs.com/package/node-hp-scan-to)
[![Docker Pulls](https://img.shields.io/docker/pulls/manuc66/node-hp-scan-to)](https://hub.docker.com/repository/docker/manuc66/node-hp-scan-to)
[![Gitter](https://badges.gitter.im/node-hp-scan-to/community.svg)](https://gitter.im/node-hp-scan-to/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![CodeFactor](https://www.codefactor.io/repository/github/manuc66/node-hp-scan-to/badge)](https://www.codefactor.io/repository/github/manuc66/node-hp-scan-to)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to?ref=badge_shield)

# node-hp-scan-to

The `node-hp-scan-to` is a Node.js application that replicates the functionality of the "Scan to Computer" from HP. For this purpose, the original HP Windows application's interaction with the device has been [reverse engineered](protocol_doc/HP%20Officejet%206500%20E710n-z.md)

Its primary purpose is to enable users to scan documents directly from an HP device and seamlessly transfer them to a computer. Unlike the original program, this program is designed to be compatible with Linux (including Docker), and is expected to work on Windows and macOS, making it accessible to a wider range of users and usages. 

## Supported devices
It has been developed and tested with the following HP All-in-One Printers:
- HP Officejet 6500A Plus
- HP Deskjet 3520
- HP Smart Tank Plus 570 series

Additionally, it has been reported to work on several other HP printer models.
- HP Deskjet 3050 All-in-One Printer - J610a
- HP Officejet 3830
- HP Officejet 5230
- HP Officejet 6700 premium
- HP Officejet 5740
- HP Officejet 6950
- HP OfficeJet Pro 8025e
- HP OfficeJet Pro 7720 Wide Format All-in-One
- HP Officejet 8010 series
- HP Deskjet 5525
- HP OfficeJet 8012
- HP OfficeJet Pro 9012e

There are good chances it also works on your HP All-in-One Printer.

Please note that the `node-hp-scan-to` project is not endorsed by nor affiliated with HP. The reverse engineering of the original HP Windows application's interaction with the device has been done independently.

## Supported device features
- ✔️ JPG scan output
- ✔️ PDF document scan output
- ✔️ Scan from automatic document feeder
- ✔️ Dual side with automatic document feeder
- ✔️ Multi page from platen
- ✔️ Automatic IP address discovery

## Provided features
- ✔️ Prebuilt Docker images (multi arch)
- ✔️ Command line support (Cross platform)
- ✔️ Customizable file names
- ✔️ Customizable resolution
- ✔️ Customizable label on the device
- ✔️ Multi platform: Linux, Windows and most probably macOS
- ✔️ Folder target or paperless-ngx upload
- ✔️ Clear all registered target
- ✔️ Automatic scan when automatic document feeder is getting loaded

## Usage

### Command line
`npx node-hp-scan-to`

- `-ip` or `--address` followed by the ip address of the printer, i.e. `-ip 192.168.0.5`. This overrides `-p`.
- `--device-up-polling-interval` is the polling interval in milliseconds to detect if the device is up or not
- `-l` or `--label` The label to display on the printer (default is the hostname).
- `-n` or `--name` followed by the printer name, it probably contains spaces, so it needs to be quoted, i.e. `-name "Officejet 6500 E710n-z"`
- `-d` or `--directory` followed by the directory path where the scanned documents should be saved, i.e. `-d ~/Documents/Scans`. Defaults to `/tmp/scan-to-pc<random value>` when not set.
- `-t` or `--temp-directory` Temp directory used for processing. Defaults to `/tmp/scan-to-pc<random value>` when not set.
- `-p` or `--pattern` followed by the pattern for the filename without file extension, i.e. `"scan"_dd.mm.yyyy_hh:MM:ss` to name the scanned file `scan_19.04.2021_17:26:47`. Date and time patterns are replaced by the current date and time, text that should not be replaced need to be inside quotes. Documentation for the pattern can be found [here](https://www.npmjs.com/package/dateformat) in the section `Mask options`. Defaults to `scan<increasing number>_page<page number>` when not set.
- `-r` or `--resolution` Resolution in DPI of the scans (defaults is 200).
- `-w` or `--width` followed by an integer, the with in pixel of the scans (default: 2481)
- `-h` or `--height` followed by an integer, the height in pixel of the scans (default: 3507)
- `-s` or `--paperless-host` followed by the paperless host name
- `k` or `--paperless-token` followed by te paperless-ngx api token
- `-D, --debug"` enables debug logs.

#### `listen command`
This is the default mode, it will listen the device for new job and trigger based on the selection on the device.

Do run `npx node-hp-scan-to listen --help` to get command line usage help

#### `adf-autoscan`
This will trigger a scan job as soon as the adf is loaded with paper

Do run `npx node-hp-scan-to adf-autoscan --help` to get command line usage help

#### `clear-registrations`
This will clear all registered target on the device (useful for trial and error and debugging)
Do run `npx node-hp-scan-to clear-registrations --help` to get command line usage help

### Run with docker

Public Pre-built Docker image:
- https://hub.docker.com/repository/docker/manuc66/node-hp-scan-to (take master: `docker pull manuc66/node-hp-scan-to:master`) 

Be aware that with docker you have to specify the ip address of the printer via the `IP` environment variable, because 
bonjour service discovery uses multicast network traffic which by default doesn't work in docker.
You could however use docker's macvlan networking, this way you can use service discovery and the `NAME` environment variable.

All scanned files are written to the volume `/scan`, the filename can be changed with the `PATTERN` environment variable.
For the correct permissions to the volume set the environment variables `PUID` and `PGID`.

Exhaustive list of supported environment variables and their meaning, or correspondence with [command-line flags](#command-line):
- `PUID`: id of user that will run the program
- `PGID`: id of group that will run the program
- `IP`: command-line flag `-ip`/`--address`
- `PATTERN`: command-line flag `-p`/`--pattern`
- `LABEL`: command-line flag `-l`/`--label`
- `NAME`: command-line flag `-n`/`--name`
- `DIR`: command-line flag `-d`/`--directory`
- `TEMP_DIR`: command-line flag `-t`/`--temp-directory`
- `RESOLUTION`: command-line flag `-r`/`--resolution`
- `PAPERLESS_HOST`: the paperless api host (if provided with token, a pdf is uploaded to paperless-ngx)
- `PAPERLESS_TOKEN`: the paperless api token
- `CMDLINE`: additional command-line flags that will be put at the end of the command.

__To enable debug logs set the environment variable `CMDLINE` to `-D`.__

The name shown on the printer's display is the hostname of the docker container, which defaults to a random value, so you may want to override it by enforcing the `hostname`, or using the `LABEL` environment variable.

#### Example for docker:
```sh
git clone ...
cd node-hp-scan-to
docker build . -t node-hp-scan-to
docker run -e IP=192.168.0.5 -e PGID=1000 -e PUID=1000 --hostname scan node-hp-scan-to
```

#### Example for docker-compose:
Write the following `docker-compose.yml` file into this directory:
```yml
version: "3"

services:
  node-hp-scan-to:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: node-hp-scan-to
    environment:
      - IP=192.168.0.5
      - LABEL=scan
      - PATTERN="scan"_dd.mm.yyyy_hh:MM:ss
      - PGID=1000
      - PUID=1000
      - TZ=Europe/London
    volumes:
      - /some/host/directory/or/volume:/scan
    restart: always
```
Then run `docker-compose up -d --build`.

#### Example for Kubernetes:
Apply the following manifest (the PersistentVolumeClaim must also be deployed beforehand):
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

### How to run from the code
If you wish to test it by cloning this repository:
```sh
git clone ...
cd node-hp-scan-to
yarn install -d
yarn build
# now start the program with the ip or name of the desired printer
node dist/index.js -ip 192.168.1.4 # or -n "Officejet 6500 E710n-z"
```

#### Debugging
I'm using Visual Studio Code to debug this application, so instead of running ts-node just enter `code .` and press F5 to start debugging.
You may want to set your printers ip or name in `.vscode/launch.json`.

## 💖 Support this project
If this project helped you save money or time or simply makes your life also easier, you can give me a cup of coffee =)

- [![Support via PayPal](https://cdn.rawgit.com/twolfson/paypal-github-button/1.0.0/dist/button.svg)](https://www.paypal.me/manuc66)
- Bitcoin — You can send me bitcoins at this address: `33gxVjey6g4Beha26fSQZLFfWWndT1oY3F`

## License
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to?ref=badge_large)
