"use strict";

import { Parser, Builder } from "xml2js";
import * as util from "util";

const parser = new Parser();

type WalkupScanDestinationData = {
  WalkupScanDestination: {
    Hostname: { _: string }[];
    Name: { _: string }[];
    LinkType: string[];
  };
};

export default class Destination {
  private readonly name: string;
  private readonly hostname: string;
  private readonly linkType: string;
  private readonly toComp: boolean;

  constructor(name: string, hostname: string, toComp: boolean) {
    this.name = name;
    this.hostname = hostname;
    this.linkType = "Network";
    this.toComp = toComp;
  }

  async toXML() {
    let rawDestination: string = '<?xml version="1.0" encoding="UTF-8"?>\n';
    if (this.toComp) {
      rawDestination +=
        '<WalkupScanDestination xmlns="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
        'xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28 WalkupScan.xsd">\n';
    } else {
      rawDestination +=
        '<WalkupScanDestination xmlns="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \n' +
        'xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd">\n';
    }

    rawDestination +=
      '\t<Hostname xmlns="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06"></Hostname>\n' +
      '\t<Name xmlns="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"></Name>\n' +
      "\t<LinkType>Network</LinkType>\n" +
      "</WalkupScanDestination>";

    const parsed = await util.promisify<string, WalkupScanDestinationData>(
      parser.parseString
    )(rawDestination);

    parsed.WalkupScanDestination.Hostname[0]._ = this.hostname;
    parsed.WalkupScanDestination.Name[0]._ = this.name;
    parsed.WalkupScanDestination.LinkType[0] = this.linkType;

    let builder = new Builder();
    let xml = builder.buildObject(parsed);
    if (this.toComp) {
      return xml.replace(/WalkupScan/g, "WalkupScanToComp");
    } else {
      return xml;
    }
  }
}
