import https from "node:https";
import tls from "node:tls";
import { getLoggerForFile } from "./logger.js";

const logger = getLoggerForFile(import.meta.url);

export const ESCL_CERT_FINGERPRINT_ENV = "ESCL_CERT_FINGERPRINT";
const CERT_FETCH_TIMEOUT_MS = 5_000;

/** The user-provided eSCL certificate pin cannot be satisfied. */
export class CertificatePinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificatePinError";
  }
}

export function normalizeFingerprint(fingerprint: string): string {
  return fingerprint.replace(/:/g, "").trim().toLowerCase();
}

export function readConfiguredFingerprint(
  value: string | undefined = process.env[ESCL_CERT_FINGERPRINT_ENV],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function derCertificateToPem(raw: Buffer): string {
  const base64 =
    raw
      .toString("base64")
      .match(/.{1,64}/g)
      ?.join("\n") ?? "";
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`;
}

export function buildPinnedAgentOptions(
  certificate: tls.PeerCertificate,
  expectedFingerprint: string,
): https.AgentOptions {
  const expected = normalizeFingerprint(expectedFingerprint);
  const actual = normalizeFingerprint(certificate.fingerprint256);
  if (actual !== expected) {
    throw new CertificatePinError(
      `The eSCL HTTPS certificate fingerprint does not match ${ESCL_CERT_FINGERPRINT_ENV}: expected ${expected}, got ${actual}.`,
    );
  }

  const commonName = certificate.subject?.CN;
  if (typeof commonName !== "string" || commonName.length === 0) {
    throw new CertificatePinError(
      "The pinned eSCL HTTPS certificate has no Common Name, so its hostname cannot be verified.",
    );
  }

  return {
    ca: derCertificateToPem(certificate.raw),
    // The printer certificate has no SAN and the client connects by IP, so
    // validate the peer against the certificate's own name while the chain is
    // pinned to the certificate provided by the user.
    servername: commonName,
  };
}

export async function fetchPeerCertificate(
  host: string,
  timeoutMs = CERT_FETCH_TIMEOUT_MS,
): Promise<tls.PeerCertificate> {
  return await new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        // The printer serves a per-device self-signed certificate with no SAN.
        // This connection only reads that certificate so its SHA-256
        // fingerprint can be checked against the user-provided pin; it is
        // closed before any data request.
        rejectUnauthorized: false, // lgtm[js/disabling-certificate-validation]
      },
      () => {
        const certificate = socket.getPeerCertificate();
        socket.end();
        if (
          certificate === undefined ||
          Object.keys(certificate).length === 0
        ) {
          reject(new Error(`No TLS certificate returned by ${host}:443.`));
          return;
        }
        resolve(certificate);
      },
    );

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(
        new Error(`Timed out reading the TLS certificate from ${host}:443.`),
      );
    });
    socket.once("error", reject);
  });
}

export async function createPrinterHttpsAgent(
  host: string,
  expectedFingerprint: string | undefined,
  fetchCertificate: (
    host: string,
  ) => Promise<tls.PeerCertificate> = fetchPeerCertificate,
): Promise<https.Agent> {
  if (expectedFingerprint === undefined) {
    logger.warn(
      `The eSCL HTTPS certificate is not pinned; accepting the printer's self-signed certificate. Set ${ESCL_CERT_FINGERPRINT_ENV}=<sha256 fingerprint> to verify it.`,
    );
    return new https.Agent({
      // The printer certificate is self-signed and per-device. Users who care
      // can pin it with ESCL_CERT_FINGERPRINT, which builds a CA-validated
      // agent below; the default unpinned mode logs a warning. This fallback
      // is dismissed in the repository's CodeQL alerts (no CA can validate a
      // per-device self-signed LAN certificate).
      rejectUnauthorized: false, // lgtm[js/disabling-certificate-validation]
    });
  }

  const certificate = await fetchCertificate(host);
  return new https.Agent(
    buildPinnedAgentOptions(certificate, expectedFingerprint),
  );
}
