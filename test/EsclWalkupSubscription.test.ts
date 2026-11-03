import { describe, it } from "mocha";
import { expect } from "chai";
import { Parser } from "xml2js";
import EsclWalkupSubscription from "../src/hpModels/EsclWalkupSubscription.js";

async function parse(xml: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    new Parser().parseString(xml, (error, result) =>
      error ? reject(error) : resolve(result as Record<string, unknown>),
    );
  });
}

describe("EsclWalkupSubscription", () => {
  it("builds the eSCL walkup subscription body", async () => {
    const xml = new EsclWalkupSubscription("homelab", [
      "Paperless",
      "Paperless duplex",
    ]).toXML();

    const parsed = await parse(xml);
    const subscription = parsed["WalkupScanSubscription"] as {
      HostIdentifier: string[];
      Connection: string[];
      Shortcuts: { Shortcut: string[] }[];
    };

    expect(subscription.HostIdentifier[0]).to.equal("homelab");
    expect(subscription.Connection[0]).to.equal("Network");
    expect(subscription.Shortcuts[0].Shortcut).to.deep.equal([
      "Paperless",
      "Paperless duplex",
    ]);
  });

  it("escapes XML metacharacters in shortcut labels", async () => {
    const xml = new EsclWalkupSubscription("host", ["A & B <C>"]).toXML();

    const parsed = await parse(xml);
    const subscription = parsed["WalkupScanSubscription"] as {
      Shortcuts: { Shortcut: string[] }[];
    };

    expect(subscription.Shortcuts[0].Shortcut[0]).to.equal("A & B <C>");
  });
});
