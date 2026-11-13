import { describe, it } from "mocha";
import { expect } from "chai";
import https from "node:https";
import type { PeerCertificate } from "node:tls";
import {
  buildPinnedAgentOptions,
  createPrinterHttpsAgent,
  derCertificateToPem,
  normalizeFingerprint,
  readConfiguredFingerprint,
} from "../src/PrinterHttpsAgent.js";

const rawCertificate = Buffer.from("fake-der-certificate");
const certificate = Object.create(null) as PeerCertificate;
Object.assign(certificate, {
  fingerprint256: "B2:2B:9E:B1",
  subject: { CN: "HP6927CC" },
  raw: rawCertificate,
});

describe("PrinterHttpsAgent", () => {
  it("normalizes fingerprints", () => {
    expect(normalizeFingerprint("B2:2B:9E:B1")).to.equal("b22b9eb1");
  });

  it("reads, trims and ignores an empty configured fingerprint", () => {
    expect(readConfiguredFingerprint("  b2:2b:9e  ")).to.equal("b2:2b:9e");
    expect(readConfiguredFingerprint("   ")).to.be.undefined;
    expect(readConfiguredFingerprint("")).to.be.undefined;
  });

  it("converts a DER certificate to PEM", () => {
    const pem = derCertificateToPem(rawCertificate);

    expect(pem).to.match(/^-----BEGIN CERTIFICATE-----\n/);
    expect(pem).to.contain(rawCertificate.toString("base64").slice(0, 8));
    expect(pem).to.match(/-----END CERTIFICATE-----\n$/);
  });

  it("builds a CA-validated agent for a matching fingerprint", () => {
    const options = buildPinnedAgentOptions(certificate, "b2:2b:9e:b1");

    expect(options.servername).to.equal("HP6927CC");
    expect(options.ca).to.be.a("string");
  });

  it("rejects a mismatching fingerprint", () => {
    expect(() => buildPinnedAgentOptions(certificate, "00:00:00:00")).to.throw(
      /does not match/,
    );
  });

  it("rejects a pinned certificate without a Common Name", () => {
    expect(() =>
      buildPinnedAgentOptions(
        { ...certificate, subject: {} },
        "b2:2b:9e:b1",
      ),
    ).to.throw(/Common Name/);
  });

  it("creates an unpinned agent when no fingerprint is configured", async () => {
    const agent = await createPrinterHttpsAgent("127.0.0.1", undefined);

    expect(agent).to.be.instanceOf(https.Agent);
  });

  it("fetches and pins the certificate when a fingerprint is configured", async () => {
    let fetchedHost: string | undefined;
    const agent = await createPrinterHttpsAgent(
      "127.0.0.1",
      "b2:2b:9e:b1",
      async (host) => {
        fetchedHost = host;
        return certificate;
      },
    );

    expect(fetchedHost).to.equal("127.0.0.1");
    expect(agent).to.be.instanceOf(https.Agent);
  });

  it("refuses to fetch data when the pinned fingerprint mismatches", async () => {
    let error: unknown;
    try {
      await createPrinterHttpsAgent(
        "127.0.0.1",
        "00:00:00:00",
        async () => certificate,
      );
    } catch (e) {
      error = e;
    }

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.match(/does not match/);
  });
});
