# node-hp-scan-to

![build](https://github.com/manuc66/node-hp-scan-to/actions/workflows/docker-image.yml/badge.svg)
[![Build Status](https://app.travis-ci.com/manuc66/node-hp-scan-to.svg?branch=master)](https://app.travis-ci.com/manuc66/node-hp-scan-to)
![npm](https://img.shields.io/npm/v/node-hp-scan-to)
[![npm](https://img.shields.io/npm/dt/node-hp-scan-to)](https://www.npmjs.com/package/node-hp-scan-to)
[![Docker Pulls](https://img.shields.io/docker/pulls/manuc66/node-hp-scan-to)](https://hub.docker.com/repository/docker/manuc66/node-hp-scan-to)
[![Gitter](https://badges.gitter.im/node-hp-scan-to/community.svg)](https://gitter.im/node-hp-scan-to/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
[![CodeFactor](https://www.codefactor.io/repository/github/manuc66/node-hp-scan-to/badge)](https://www.codefactor.io/repository/github/manuc66/node-hp-scan-to)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to?ref=badge_shield)

Little command line program that allow to send scan from device to computer.

Can be run with npx : `npx node-hp-scan-to` or with Docker (see below)

Developed and tested for the following HP All-in-One Printers:
- HP Officejet 6500A Plus
- HP Deskjet 3520
- HP Smart Tank Plus 570 series

The following printer are also working:
- Officejet 6700 premium
- HP Officejet 5740
- HP OfficeJet Pro 8025e

There are good chances it also works on your HP All-in-One Printer.
For this purpose, the original HP Windows application's interaction with the device has been [reverse engineered](protocol_doc/HP%20Officejet%206500%20E710n-z.md).

This project is not endorsed by nor affiliated with HP.

## Usage
```sh
git clone ...
cd node-hp-scan-to
yarn install -d
yarn build
# now start the program with the ip or name of the desired printer
node dist/index.js -ip 192.168.1.4 # or -n "Officejet 6500 E710n-z"
```

### Command line options
- `-ip` or `--address` followed by the ip address of the printer, i.e. `-ip 192.168.0.5`. This overrides `-p`.
- `-n` or `--name` followed by the printer name, it probably contains spaces, so it needs to be quoted, i.e. `-name "Officejet 6500 E710n-z"`
- `-d` or `--directory` followed by the directory path where the scanned documents should be saved, i.e. `-d ~/Documents/Scans`. Defaults to `/tmp/scan-to-pc<random value>` when not set.
- `-p` or `--pattern` followed by the pattern for the filename without file extension, i.e. `"scan"_dd.mm.yyyy_hh:MM:ss` to name the scanned file `scan_19.04.2021_17:26:47`. Date and time patterns are replaced by the current date and time, text that should not be replaced need to be inside quotes. Documentation for the pattern can be found [here](https://www.npmjs.com/package/dateformat) in the section `Mask options`. Defaults to `scan<increasing number>_page<page number>` when not set.
- `-D, --debug"` enables debug logs.

### Run with docker
Be aware that with docker you have to specify the ip address of the printer via the `IP` environment variable, because 
bonjour service discovery uses multicast network traffic which by default doesn't work in docker.
You could however use docker's macvlan networking, this way you can use service discovery and the `NAME` environment variable.

All scanned files are written to the volume `/scan`, the filename can be changed with the `PATTERN` environment variable.
For the correct permissions to the volume set the environment variables `PUID` and `PGID`.

To enable debug logs set the environment variable `CMDLINE` to `-D`. Can also be used for any other command line parameters.

The name shown on the printer's display is the hostname of the docker container, which defaults to a random value, so you may want to specify it via the `-hostname` argument.

Example for docker:
```sh
git clone ...
cd node-hp-scan-to
docker build . -t node-hp-scan-to
docker run -e IP=192.168.0.5 -e PGID=1000 -e PUID=1000 --hostname scan node-hp-scan-to
```

Example for docker-compose:
Write the following `docker-compose.yml` file into this directory:
```yml
version: "3"

services:
  node-hp-scan-to:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: node-hp-scan-to
    hostname: scan
    environment:
      - IP=192.168.0.5
      - PATTERN="scan"_dd.mm.yyyy_hh:MM:ss
      - PGID=1000
      - PUID=1000
      - TZ=Europe/London
    volumes:
      - /some/host/directory/or/volume:/scan
    restart: always
```
Then run `docker-compose up -d --build`.
To 

Public Pre-built Docker image:
- https://hub.docker.com/repository/docker/manuc66/node-hp-scan-to

## Debugging
I'm using Visual Studio Code to debug this application, so instead of running ts-node just enter `code .` and press F5 to start debugging.
You may want to set your printers ip or name in `.vscode/launch.json`.


## 💖 Support this project
If this project helped you save money or time or simply makes your life also easier, you can give me a cup of coffee =)

- [![Support via PayPal](https://cdn.rawgit.com/twolfson/paypal-github-button/1.0.0/dist/button.svg)](https://www.paypal.me/manuc66)
- Bitcoin — You can send me bitcoins at this address: `33gxVjey6g4Beha26fSQZLFfWWndT1oY3F`

## License
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fmanuc66%2Fnode-hp-scan-to?ref=badge_large)