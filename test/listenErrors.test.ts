import { describe, it } from "mocha";
import { expect } from "chai";
import { AxiosError, type AxiosResponse } from "axios";
import { CertificatePinError } from "../src/PrinterHttpsAgent.js";
import {
  getListenerRetryDelayMs,
  isRetryableListenerError,
} from "../src/commands/listenCmd.js";
import { PermanentScanListenerError } from "../src/scanListeners/ScanListener.js";

function httpError(status: number): AxiosError {
  return new AxiosError(
    "request failed",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    { status } as AxiosResponse,
  );
}

function networkError(): AxiosError {
  return new AxiosError("network failure", "ECONNABORTED");
}

describe("isRetryableListenerError", () => {
  it("retries network errors without an HTTP response", () => {
    expect(isRetryableListenerError(networkError())).to.be.true;
  });

  it("retries server errors", () => {
    expect(isRetryableListenerError(httpError(500))).to.be.true;
    expect(isRetryableListenerError(httpError(503))).to.be.true;
  });

  it("retries timeouts, rate limits and expired subscriptions", () => {
    expect(isRetryableListenerError(httpError(408))).to.be.true;
    expect(isRetryableListenerError(httpError(429))).to.be.true;
    expect(isRetryableListenerError(httpError(404))).to.be.true;
    expect(isRetryableListenerError(httpError(410))).to.be.true;
  });

  it("does not retry permanent client errors", () => {
    expect(isRetryableListenerError(httpError(400))).to.be.false;
    expect(isRetryableListenerError(httpError(401))).to.be.false;
    expect(isRetryableListenerError(httpError(403))).to.be.false;
    expect(isRetryableListenerError(httpError(405))).to.be.false;
  });

  it("treats unknown errors as retryable", () => {
    expect(isRetryableListenerError(new Error("unexpected"))).to.be.true;
  });

  it("does not retry permanent listener errors", () => {
    expect(
      isRetryableListenerError(
        new PermanentScanListenerError("walkup is no longer available"),
      ),
    ).to.be.false;
  });

  it("does not retry certificate pin failures", () => {
    expect(
      isRetryableListenerError(new CertificatePinError("fingerprint mismatch")),
    ).to.be.false;
  });
});

describe("getListenerRetryDelayMs", () => {
  it("honours the device Retry-After", () => {
    const error = new AxiosError(
      "Service Unavailable",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 503,
        headers: { "retry-after": "3" },
      } as unknown as AxiosResponse,
    );

    expect(getListenerRetryDelayMs(error)).to.equal(3000);
  });

  it("falls back to the default delay", () => {
    expect(getListenerRetryDelayMs(httpError(503))).to.equal(1000);
    expect(getListenerRetryDelayMs(new Error("unexpected"))).to.equal(1000);
  });
});
