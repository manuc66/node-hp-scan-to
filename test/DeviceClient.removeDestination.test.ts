import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import DeviceClient from "../src/DeviceClient.js";

const DESTINATION_PATH =
  "/WalkupScanToComp/WalkupScanToCompDestinations/db79fa82-9d3a-4c97-bfcf-17ec7fc7ac71";

describe("DeviceClient.removeDestinationByUri", () => {
  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("removes the destination from the printer", async () => {
    const api = new DeviceClient("127.0.0.1", false);
    const scope = nock("http://127.0.0.1").delete(DESTINATION_PATH).reply(204);

    expect(await api.removeDestinationByUri(DESTINATION_PATH)).to.be.true;
    expect(scope.isDone()).to.be.true;
  });

  it("accepts a destination URI as returned by the printer", async () => {
    const api = new DeviceClient("127.0.0.1", false);
    nock("http://127.0.0.1").delete(DESTINATION_PATH).reply(200);

    expect(
      await api.removeDestinationByUri(`http://127.0.0.1${DESTINATION_PATH}`),
    ).to.be.true;
  });

  it("throws on an unexpected success status", async () => {
    const api = new DeviceClient("127.0.0.1", false);
    // axios rejects 4xx/5xx before the status check, so the only way to reach
    // the explicit error is a 2xx the printer should not use for a delete.
    nock("http://127.0.0.1").delete(DESTINATION_PATH).reply(201);

    let error: unknown;
    try {
      await api.removeDestinationByUri(DESTINATION_PATH);
    } catch (e) {
      error = e;
    }

    expect(String(error)).to.contain("Unexpected status code");
  });

  it("propagates a printer error status", async () => {
    const api = new DeviceClient("127.0.0.1", false);
    nock("http://127.0.0.1").delete(DESTINATION_PATH).reply(500);

    let error: unknown;
    try {
      await api.removeDestinationByUri(DESTINATION_PATH);
    } catch (e) {
      error = e;
    }

    expect(String(error)).to.contain("500");
  });

  it("keeps removeDestination(destination) working through the URI helper", async () => {
    const api = new DeviceClient("127.0.0.1", false);
    nock("http://127.0.0.1").delete(DESTINATION_PATH).reply(204);

    const destination = {
      resourceURI: DESTINATION_PATH,
    } as unknown as Parameters<DeviceClient["removeDestination"]>[0];

    expect(await api.removeDestination(destination)).to.be.true;
  });
});
