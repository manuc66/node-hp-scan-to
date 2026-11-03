"use strict";

import { Builder } from "xml2js";

export const ESCL_NAMESPACE = "http://schemas.hp.com/imaging/escl/2011/05/03";

/**
 * Request body for `POST /eSCL/WalkupSubscriptions`.
 *
 * A walkup subscription is the eSCL equivalent of the legacy WalkupScan
 * destination: it makes the host visible on the printer panel and declares
 * the shortcuts the user can pick from.
 */
export default class EsclWalkupSubscription {
  private readonly hostIdentifier: string;
  private readonly shortcuts: string[];

  constructor(hostIdentifier: string, shortcuts: string[]) {
    this.hostIdentifier = hostIdentifier;
    this.shortcuts = shortcuts;
  }

  toXML(): string {
    const builder = new Builder({
      xmldec: { version: "1.0", encoding: "UTF-8" },
      renderOpts: { pretty: true, indent: "\t", newline: "\n" },
    });

    return builder.buildObject({
      "scan:WalkupScanSubscription": {
        $: {
          "xmlns:scan": ESCL_NAMESPACE,
          "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        },
        "scan:HostIdentifier": this.hostIdentifier,
        "scan:Connection": "Network",
        "scan:Shortcuts": {
          "scan:Shortcut": this.shortcuts,
        },
      },
    });
  }
}
