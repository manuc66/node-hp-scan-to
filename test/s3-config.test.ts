import { describe, it } from "mocha";
import { expect } from "chai";
import { getS3Config } from "../src/program.js";
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
    getS3Config(options, fileConfig);
  } catch (e) {
    error = e;
  }
  expect(error, "expected getS3Config to reject this S3 configuration").to.be.an(
    "error",
  );
  return error as Error;
}

describe("S3 config resolution", () => {
  const complete = {
    s3Url: "https://s3.example.test",
    s3Bucket: "scans",
    s3AccessKeyId: "AKIA",
    s3SecretAccessKey: "secret",
  };

  it("accepts a complete S3 configuration", () => {
    expect(getS3Config(buildOptions(complete), {})).to.exist;
  });

  it("rejects an S3 URL without a bucket", () => {
    const error = expectConfigError(
      buildOptions({
        s3Url: "https://s3.example.test",
        s3AccessKeyId: "AKIA",
        s3SecretAccessKey: "secret",
      }),
      {},
    );
    expect(error.message).to.include("s3-bucket");
  });

  it("rejects an S3 URL without access credentials", () => {
    const error = expectConfigError(
      buildOptions({
        s3Url: "https://s3.example.test",
        s3Bucket: "scans",
      }),
      {},
    );
    expect(error.message).to.include("s3-secret-access-key");
  });

  it("rejects credentials without an endpoint or bucket", () => {
    const error = expectConfigError(
      buildOptions({
        s3AccessKeyId: "AKIA",
        s3SecretAccessKey: "secret",
      }),
      {},
    );
    expect(error.message).to.include("s3-url");
  });

  it("returns undefined when no S3 option is provided", () => {
    expect(getS3Config(buildOptions({}), {})).to.be.undefined;
  });
});