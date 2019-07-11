"use strict";

import xml2js from "xml2js";
import * as util from "util";
const parser = new xml2js.Parser();

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

  constructor(name: string, hostname: string) {
    this.name = name;
    this.hostname = hostname;
    this.linkType = "Network";
  }

  async toXML() {
    let rawDestination =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<WalkupScanDestination xmlns="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \n' +
      'xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd">\n' +
      '<Hostname xmlns="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06"></Hostname>\n' +
      '<Name xmlns="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"></Name>\n' +
      "<LinkType>Network</LinkType>\n" +
      "</WalkupScanDestination>";

    const parsed = (await util.promisify(parser.parseString)(
      rawDestination
    )) as WalkupScanDestinationData;

    parsed.WalkupScanDestination.Hostname[0]._ = this.hostname;
    parsed.WalkupScanDestination.Name[0]._ = this.name;
    parsed.WalkupScanDestination.LinkType[0] = this.linkType;

    let builder = new xml2js.Builder();
    return builder.buildObject(parsed);
  }
}