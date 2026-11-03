import { describe, it } from "mocha";
import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getWebhookConfig } from "../src/program.js";
import type { ListenOptions } from "../src/program.js";
import type { FileConfig } from "../src/type/FileConfig.js";

function buildOptions(overrides: Record<string, unknown>): ListenOptions {
  return { ...overrides };
}

function expectConfigError(
  options: ListenOptions,
  fileConfig: FileConfig,
): Error {
  let error: unknown;
  try {
    getWebhookConfig(options, fileConfig);
  } catch (e) {
    error = e;
  }
  expect(
    error,
    "expected getWebhookConfig to reject this webhook configuration",
  ).to.be.an("error");
  return error as Error;
}

describe("webhook config resolution", () => {
  const url = { webhookUrl: "http://127.0.0.1:1" };

  it("rejects an explicit hmac auth without any secret", () => {
    const error = expectConfigError(
      buildOptions({ ...url, webhookAuth: "hmac" }),
      {},
    );
    expect(error.message).to.include("hmac");
  });

  it("rejects hmac auth coming from the config file without any secret", () => {
    const error = expectConfigError(buildOptions(url), {
      webhook_auth: "hmac",
    });
    expect(error.message).to.include("hmac");
  });

  it("rejects an explicit bearer auth without a token", () => {
    const error = expectConfigError(
      buildOptions({ ...url, webhookAuth: "bearer" }),
      {},
    );
    expect(error.message).to.include("bearer");
  });

  it("rejects an explicit basic auth with only a username", () => {
    const error = expectConfigError(
      buildOptions({ ...url, webhookAuth: "basic", webhookUsername: "scanner" }),
      {},
    );
    expect(error.message).to.include("basic");
  });

  it("accepts each auth scheme when its credentials are present", () => {
    expect(
      getWebhookConfig(
        buildOptions({ ...url, webhookAuth: "hmac", webhookSecret: "s3cr3t" }),
        {},
      ),
    ).to.exist;
    expect(
      getWebhookConfig(
        buildOptions({ ...url, webhookAuth: "bearer", webhookToken: "tok" }),
        {},
      ),
    ).to.exist;
    expect(
      getWebhookConfig(
        buildOptions({
          ...url,
          webhookAuth: "basic",
          webhookUsername: "u",
          webhookPassword: "p",
        }),
        {},
      ),
    ).to.exist;
    expect(
      getWebhookConfig(
        buildOptions({ ...url, webhookAuth: "none", webhookSecret: "s3cr3t" }),
        {},
      ),
    ).to.exist;
  });

  it("rejects an inferred basic auth with only a username", () => {
    const error = expectConfigError(
      buildOptions({ ...url, webhookUsername: "scanner" }),
      {},
    );
    expect(error.message).to.include("basic");
  });

  it("rejects an inferred basic auth with only a password", () => {
    const error = expectConfigError(
      buildOptions({ ...url, webhookPassword: "secret" }),
      {},
    );
    expect(error.message).to.include("basic");
  });

  it("treats a blank secret as no secret at all", () => {
    expect(
      getWebhookConfig(buildOptions({ ...url, webhookSecret: "   " }), {})
        ?.auth,
    ).to.equal("none");
    const error = expectConfigError(
      buildOptions({ ...url, webhookAuth: "hmac", webhookSecret: "" }),
      {},
    );
    expect(error.message).to.include("hmac");
  });

  it("treats a blank secret file as no secret at all", () => {
    const secretFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "webhook-secret-")),
      "secret",
    );
    fs.writeFileSync(secretFile, "\n");
    expect(
      getWebhookConfig(buildOptions({ ...url, webhookSecretFile: secretFile }), {})
        ?.auth,
    ).to.equal("none");
  });

  it("falls back to the default signature header when the configured one is blank", () => {
    const fromCli = getWebhookConfig(
      buildOptions({ ...url, webhookAuthHeader: "   " }),
      {},
    );
    expect(fromCli?.authHeader).to.equal("x-webhook-signature");

    const fromFile = getWebhookConfig(buildOptions(url), {
      webhook_auth_header: "",
    });
    expect(fromFile?.authHeader).to.equal("x-webhook-signature");
  });

  it("rejects a webhook url that is not an absolute http(s) URL", () => {
    const missingScheme = expectConfigError(
      buildOptions({ webhookUrl: "n8n.example.test/webhook/scan" }),
      {},
    );
    expect(missingScheme.message).to.include("url");

    const wrongScheme = expectConfigError(
      buildOptions({ webhookUrl: "ftp://n8n.example.test/scan" }),
      {},
    );
    expect(wrongScheme.message).to.include("url");
  });

  it("defaults to the full payload profile", () => {
    const config = getWebhookConfig(buildOptions(url), {});
    expect(config?.payload).to.equal("full");
  });

  it("accepts the minimal payload profile from the CLI or the config file", () => {
    const fromCli = getWebhookConfig(
      buildOptions({ ...url, webhookPayload: "minimal" }),
      {},
    );
    expect(fromCli?.payload).to.equal("minimal");

    const fromFile = getWebhookConfig(buildOptions(url), {
      webhook_payload: "minimal",
    });
    expect(fromFile?.payload).to.equal("minimal");
  });

  it("keeps the scanned files by default when only a webhook is configured", () => {
    // A webhook is a notification: on its own it must not turn retention off,
    // otherwise the only copy of the scan is deleted right after the event
    // that advertises its local path.
    const config = getWebhookConfig(buildOptions(url), {});
    expect(config?.keepFiles).to.equal(true);
  });

  it("still honours an explicit keep_files: false", () => {
    const config = getWebhookConfig(buildOptions(url), { keep_files: false });
    expect(config?.keepFiles).to.equal(false);
  });

  it("still infers the auth scheme from the credentials", () => {
    expect(
      getWebhookConfig(buildOptions({ ...url, webhookSecret: "s3cr3t" }), {})
        ?.auth,
    ).to.equal("hmac");
    expect(
      getWebhookConfig(buildOptions({ ...url, webhookToken: "tok" }), {})
        ?.auth,
    ).to.equal("bearer");
    expect(
      getWebhookConfig(
        buildOptions({ ...url, webhookUsername: "u", webhookPassword: "p" }),
        {},
      )?.auth,
    ).to.equal("basic");
    expect(getWebhookConfig(buildOptions(url), {})?.auth).to.equal("none");
  });
});
