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
    const subscription = parsed["scan:WalkupScanSubscription"] as Record<
      string,
      unknown
    > as {
      "scan:HostIdentifier": string[];
      "scan:Connection": string[];
      "scan:Shortcuts": { "scan:Shortcut": string[] }[];
    };

    expect(subscription["scan:HostIdentifier"][0]).to.equal("homelab");
    expect(subscription["scan:Connection"][0]).to.equal("Network");
    expect(subscription["scan:Shortcuts"][0]["scan:Shortcut"]).to.deep.equal([
      "Paperless",
      "Paperless duplex",
    ]);
  });

  it("escapes XML metacharacters in shortcut labels", async () => {
    const xml = new EsclWalkupSubscription("host", ["A & B <C>"]).toXML();

    const parsed = await parse(xml);
    const subscription = parsed["scan:WalkupScanSubscription"] as {
      "scan:Shortcuts": { "scan:Shortcut": string[] }[];
    };

    expect(subscription["scan:Shortcuts"][0]["scan:Shortcut"][0]).to.equal(
      "A & B <C>",
    );
  });
});
