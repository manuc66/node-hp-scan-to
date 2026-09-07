import { describe, it } from "mocha";
import { expect } from "chai";
import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const entry = path.join(repoRoot, "test", "asset", "log-upload-network-error.ts");

function runUploadLog(target: "s3" | "nextcloud" | "paperless"): string {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env["LOG_FORMAT"];
  delete env["LOG_LEVEL"];
  const options: SpawnSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    env: { ...env, NODE_ENV: "production", LOG_FORMAT: "json" },
  };
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", entry, target],
    options,
  );
  expect(res.status).to.equal(0, `stderr: ${res.stderr}`);
  return `${res.stdout}${res.stderr}`;
}

describe("upload error logs must not contain credentials", () => {
  it("S3 network failure", () => {
    const dumped = runUploadLog("s3");
    expect(dumped).to.include("Fail to upload document to S3");
    expect(dumped).to.not.include("AKIA_S3_DO_NOT_LOG");
    expect(dumped).to.not.include("s3-secret-access-key-DO-NOT-LOG");
    expect(dumped).to.not.include("s3-sts-token-DO-NOT-LOG");
    expect(dumped).to.not.include("AWS4-HMAC-SHA256");
    expect(dumped).to.not.include("x-amz-security-token");
  });

  it("Nextcloud network failure", () => {
    const dumped = runUploadLog("nextcloud");
    expect(dumped).to.match(/Fail to (upload document|check upload folder exists)/);
    expect(dumped).to.not.include("nc-password-DO-NOT-LOG");
    const basic = Buffer.from("scanner:nc-password-DO-NOT-LOG").toString(
      "base64",
    );
    expect(dumped).to.not.include(basic);
    expect(dumped).to.not.include("Authorization");
  });

  it("Paperless network failure", () => {
    const dumped = runUploadLog("paperless");
    expect(dumped).to.include("Fail to upload document");
    expect(dumped).to.not.include("paperless-token-DO-NOT-LOG");
    expect(dumped).to.not.include("Token paperless-token-DO-NOT-LOG");
  });
});
