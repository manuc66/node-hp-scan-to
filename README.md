# node-hp-scan-to

[![Build Status](https://travis-ci.org/manuc66/node-hp-scan-to.svg?branch=master)](https://travis-ci.org/manuc66/node-hp-scan-to)

Little command line program that allow to send scan from device to computer.

Developed and tested for the following HP All-in-One Printers:
- HP Officejet 6500A Plus
- HP Deskjet 3520

There are good chances it also works on your HP All-in-One Printer.
For this purpose, the original HP Windows application's interaction with the device has been [reverse engineered](protocol_doc/index.md).

This project is not endorsed by nor affiliated with HP.

## Usage
```
git clone ...
cd node-hp-scan-to
yarn install -d
# now edit src/index.ts and set your printer in line "service.name.startsWith("Officejet 6500 E710n-z")"
ts-node src/index.ts
```

## Debugging
I'm using Visual Studio Code to debug this application, so instead of running ts-node just enter `code .` and press F5 to start debugging.