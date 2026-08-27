# Supported Devices

This page tracks HP printers and scanners that are known to work with
`node-hp-scan-to`.

## Tested During Development

These devices were used while developing or testing the project:

- HP DeskJet 3520
- HP OfficeJet 6500A Plus
- HP Smart Tank Plus 570 series
- HP OfficeJet Pro 9019e

## Community Reports

Users have reported successful scans with these devices:

- HP DeskJet 3050 (J610a)
- HP DeskJet 3522
- HP DeskJet 3775
- HP DeskJet 4670
- HP DeskJet 5525
- HP DeskJet Ink Advantage 4530 All-in-One Printer series
- HP Envy 4504
- HP Envy 4520
- HP Envy 5530
- HP Envy 5532
- HP Envy 7640
- HP OfficeJet 250 Mobile
- HP OfficeJet 3830
- HP OfficeJet 5230
- HP OfficeJet 5740
- HP OfficeJet 6700 Premium
- HP OfficeJet 6950
- HP OfficeJet 8010 series
- HP OfficeJet 8012
- HP OfficeJet Pro 7720 Wide Format All-in-One
- HP OfficeJet Pro 7730
- HP OfficeJet Pro 8025e
- HP OfficeJet Pro 9012e
- HP PageWide 377dw MFP

## Add A Printer Report

If your printer works and is not listed yet, open a pull request that updates
the list above. Include the following details in the pull request body:

- Exact printer model shown by the printer UI or HP software
- Connection type used by `node-hp-scan-to` (`--address`, `--name`, Docker, or
  another setup)
- Command or mode tested, such as `listen`, `single-scan`, or `adf-autoscan`
- Output format tested, such as JPG or PDF
- Anything that did not work, if the support is partial

If you are not comfortable opening a pull request, open an issue with the same
details and mention that it is a device support report.
