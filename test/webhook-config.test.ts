import { describe, it } from "mocha";
import { expect } from "chai";
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
