import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import { AxiosError, type AxiosResponse } from "axios";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import DeviceClient from "../src/DeviceClient.js";
import { DeviceNotReadyError } from "../src/type/DeviceNotReadyError.js";
import { ScanPlexMode } from "../src/hpModels/ScanPlexMode.js";

const scannerStatus = `<?xml version="1.0"?>
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
    xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:State>Idle</pwg:State>
</scan:ScannerStatus>`;

const walkupEvent = `<?xml version="1.0"?>
<scan:WalkupScanEvent xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
    xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Event>ScanRequested</scan:Event>
  <scan:Shortcut>Paperless</scan:Shortcut>
  <scan:ScanSettings><scan:Duplex>false</scan:Duplex></scan:ScanSettings>
</scan:WalkupScanEvent>`;

function mockEsclBaseDetection(base = "http://127.0.0.1"): nock.Scope {
  return nock(base).get("/eSCL/ScannerStatus").reply(200, scannerStatus);
}

describe("DeviceClient eSCL support", () => {
  let tempDir: string;

  beforeEach(() => {
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.cleanAll();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "device-client-escl-"));
  });

  afterEach(() => {
    nock.cleanAll();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("DiscoveryTree fallback", () => {
    it("returns an empty tree on 404", async () => {
      nock("http://127.0.0.1").get("/DevMgmt/DiscoveryTree.xml").reply(404);

      const tree = await new DeviceClient("127.0.0.1").getDiscoveryTree();

      expect(tree.WalkupScanManifestURI).to.be.null;
      expect(tree.WalkupScanToCompManifestURI).to.be.null;
      expect(tree.ScanJobManifestURI).to.be.null;
      expect(tree.EsclManifestURI).to.be.null;
    });

    it("returns an empty tree on 405", async () => {
      nock("http://127.0.0.1").get("/DevMgmt/DiscoveryTree.xml").reply(405);

      const tree = await new DeviceClient("127.0.0.1").getDiscoveryTree();

      expect(tree.ScanJobManifestURI).to.be.null;
    });

    it("falls back to HTTPS when HTTP does not serve the tree", async () => {
      nock("http://127.0.0.1").get("/DevMgmt/DiscoveryTree.xml").reply(404);
      nock("https://127.0.0.1")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(
          200,
          `<?xml version="1.0" encoding="UTF-8"?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/discoverytree/2009/03/12" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
  <ledm:SupportedIfc>
    <dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
    <ledm:ManifestURI>/Scan/ScanJobManifest.xml</ledm:ManifestURI>
  </ledm:SupportedIfc>
</ledm:DiscoveryTree>`,
        );

      const tree = await new DeviceClient("127.0.0.1").getDiscoveryTree();

      expect(tree.ScanJobManifestURI).to.equal("/Scan/ScanJobManifest.xml");
    });

    it("still fails on other statuses", async () => {
      nock("http://127.0.0.1").get("/DevMgmt/DiscoveryTree.xml").reply(500);

      await expectRejects(
        new DeviceClient("127.0.0.1").getDiscoveryTree(),
        /status 500/,
      );
    });
  });

  describe("device liveness", () => {
    it("reports a device with no reachable HTTP or HTTPS port as down", async () => {
      // nock intercepts low-level sockets and would make the connection look
      // successful; this test needs the real network stack.
      nock.restore();
      // 192.0.2.0/24 is reserved for documentation and never routed.
      const api = new DeviceClient("192.0.2.1");

      expect(await api.isAlive(50)).to.be.false;
    });
  });

  describe("eSCL base URL", () => {
    it("falls back to HTTPS when HTTP does not expose eSCL", async () => {
      nock("http://127.0.0.1").get("/eSCL/ScannerStatus").reply(404);
      nock("https://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .times(2)
        .reply(200, scannerStatus);

      const api = new DeviceClient("127.0.0.1");
      const base = await api.getEsclBaseUrl();
      const status = await api.getEsclScanStatus();

      expect(base).to.equal("https://127.0.0.1");
      expect(status.scannerState).to.equal("Idle");
    });

    it("retries detection instead of caching a failed probe", async () => {
      nock("http://127.0.0.1").get("/eSCL/ScannerStatus").twice().reply(404);
      nock("https://127.0.0.1").get("/eSCL/ScannerStatus").reply(404);
      nock("https://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(200, scannerStatus);

      const api = new DeviceClient("127.0.0.1");

      expect(await api.getEsclBaseUrl()).to.equal("http://127.0.0.1");
      expect(await api.getEsclBaseUrl()).to.equal("https://127.0.0.1");
    });

    it("reuses the origin of an absolute job URL", async () => {
      const jobUrl = "http://127.0.0.1/eSCL/ScanJobs/1";
      nock("http://127.0.0.1")
        .get("/eSCL/ScanJobs/1/ScanImageInfo")
        .reply(
          200,
          fs.readFileSync(
            path.resolve(__dirname, "./asset/eSCL_ScanImageInfo.xml"),
            "utf-8",
          ),
        );
      nock("http://127.0.0.1")
        .get("/eSCL/ScannerStatus")
        .reply(200, scannerStatus);

      const api = new DeviceClient("127.0.0.1");
      await api.getEsclScanImageInfo(jobUrl);
      const status = await api.getEsclScanStatus();

      expect(status.scannerState).to.equal("Idle");
    });
  });

  describe("walkup subscription", () => {
    it("reports walkup support only when the collection is served", async () => {
      mockEsclBaseDetection();
      nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(200);
      nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(404);

      const api = new DeviceClient("127.0.0.1");

      expect(await api.supportsEsclWalkup()).to.be.true;
      expect(await api.supportsEsclWalkup()).to.be.false;
    });

    it("classifies the walkup collection probe", async () => {
      mockEsclBaseDetection();
      nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(200);
      nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(405);
      nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(404);
      nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(403);
      nock("http://127.0.0.1").get("/eSCL/WalkupSubscriptions").reply(500);
      nock("http://127.0.0.1")
        .get("/eSCL/WalkupSubscriptions")
        .replyWithError("connection refused");

      const api = new DeviceClient("127.0.0.1");

      expect(await api.probeEsclWalkup()).to.equal("supported");
      expect(await api.probeEsclWalkup()).to.equal("supported");
      expect(await api.probeEsclWalkup()).to.equal("missing");
      expect(await api.probeEsclWalkup()).to.equal("refused");
      expect(await api.probeEsclWalkup()).to.equal("unreachable");
      expect(await api.probeEsclWalkup()).to.equal("unreachable");
    });

    it("treats 403, 404 and 410 as an expired subscription", () => {
      const status = (code: number): AxiosError =>
        new AxiosError(
          `Request failed with status code ${code}`,
          "ERR_BAD_REQUEST",
          undefined,
          undefined,
          { status: code } as AxiosResponse,
        );

      expect(DeviceClient.isSubscriptionExpired(status(403))).to.be.true;
      expect(DeviceClient.isSubscriptionExpired(status(404))).to.be.true;
      expect(DeviceClient.isSubscriptionExpired(status(410))).to.be.true;
      expect(DeviceClient.isSubscriptionExpired(status(401))).to.be.false;
      expect(DeviceClient.isSubscriptionExpired(status(500))).to.be.false;
      expect(DeviceClient.isSubscriptionExpired(new Error("boom"))).to.be.false;
    });

    it("accepts a 200 when re-registering an existing subscription", async () => {
      mockEsclBaseDetection();
      nock("http://127.0.0.1")
        .post("/eSCL/WalkupSubscriptions")
        .reply(200, "", {
          Location: "http://127.0.0.1/eSCL/WalkupSubscriptions/sub-1",
        });

      const subscriptionURI = await new DeviceClient(
        "127.0.0.1",
      ).registerEsclWalkupSubscription("homelab", ["Paperless"]);

      expect(subscriptionURI).to.equal("/eSCL/WalkupSubscriptions/sub-1");
    });

    it("registers, long-polls an event and removes the subscription", async () => {
      mockEsclBaseDetection();
      let requestBody = "";
      nock("http://127.0.0.1")
        .post("/eSCL/WalkupSubscriptions", (body) => {
          requestBody = String(body);
          return true;
        })
        .reply(201, "", {
          Location: "http://127.0.0.1/eSCL/WalkupSubscriptions/sub-1",
        });
      nock("http://127.0.0.1")
        .get("/eSCL/WalkupSubscriptions/sub-1/Event")
        .query({ timeout: "100" })
        .reply(200, walkupEvent);
      nock("http://127.0.0.1")
        .delete("/eSCL/WalkupSubscriptions/sub-1")
        .reply(200);

      const api = new DeviceClient("127.0.0.1");
      const subscriptionURI = await api.registerEsclWalkupSubscription(
        "homelab",
        ["Paperless"],
      );
      const event = await api.getEsclWalkupEvent(subscriptionURI, 100);
      await api.removeEsclWalkupSubscription(subscriptionURI);

      expect(subscriptionURI).to.equal("/eSCL/WalkupSubscriptions/sub-1");
      expect(requestBody).to.contain("homelab");
      expect(requestBody).to.contain("Paperless");
      expect(event?.shortcut).to.equal("Paperless");
      expect(event?.scanPlexMode).to.equal(ScanPlexMode.Simplex);
    });

    it("returns null when the long-poll times out", async () => {
      mockEsclBaseDetection();
      nock("http://127.0.0.1")
        .get("/eSCL/WalkupSubscriptions/sub-1/Event")
        .query({ timeout: "100" })
        .reply(204);

      const api = new DeviceClient("127.0.0.1");
      const event = await api.getEsclWalkupEvent(
        "/eSCL/WalkupSubscriptions/sub-1",
        100,
      );

      expect(event).to.be.null;
    });

    it("rejects a registration without a Location header", async () => {
      mockEsclBaseDetection();
      nock("http://127.0.0.1").post("/eSCL/WalkupSubscriptions").reply(201, "");

      await expectRejects(
        new DeviceClient("127.0.0.1").registerEsclWalkupSubscription(
          "homelab",
          ["Paperless"],
        ),
        /Unexpected status code or location/,
      );
    });
  });

  describe("page download", () => {
    it("downloads a page with its content type", async () => {
      nock("http://127.0.0.1")
        .get("/eSCL/ScanJobs/1/NextDocument")
        .reply(200, Buffer.from("jpeg-data"), {
          "Content-Type": "image/jpeg",
        });

      const destination = path.join(tempDir, "page.jpg");
      const result = await new DeviceClient("127.0.0.1").downloadEsclPage(
        "http://127.0.0.1/eSCL/ScanJobs/1",
        destination,
      );

      expect(result.contentType).to.equal("image/jpeg");
      expect(fs.readFileSync(destination, "utf-8")).to.equal("jpeg-data");
    });

    it("lets the caller detect the end of the job on 404", async () => {
      nock("http://127.0.0.1").get("/eSCL/ScanJobs/1/NextDocument").reply(404);

      await expectRejects(
        new DeviceClient("127.0.0.1").downloadEsclPage(
          "http://127.0.0.1/eSCL/ScanJobs/1",
          path.join(tempDir, "page.jpg"),
        ),
        /status code 404/,
      );
    });
  });
});

describe("DeviceClient Retry-After", () => {
  function unavailable(headers: Record<string, string>): AxiosError {
    return new AxiosError(
      "Service Unavailable",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      { status: 503, headers } as AxiosResponse,
    );
  }

  it("reads a delay in seconds", () => {
    expect(
      DeviceClient.getRetryAfterMs(unavailable({ "retry-after": "2" })),
    ).to.equal(2000);
  });

  it("reads an HTTP date", () => {
    const retryAt = new Date(Date.now() + 5000).toUTCString();

    const delay = DeviceClient.getRetryAfterMs(
      unavailable({ "retry-after": retryAt }),
    );

    expect(delay).to.be.within(3000, 5100);
  });

  it("clamps a very long delay", () => {
    expect(
      DeviceClient.getRetryAfterMs(unavailable({ "retry-after": "9999" })),
    ).to.equal(60_000);
  });

  it("ignores a missing or unusable header", () => {
    expect(DeviceClient.getRetryAfterMs(unavailable({}))).to.be.null;
    expect(DeviceClient.getRetryAfterMs(unavailable({ "retry-after": "soon" })))
      .to.be.null;
    expect(DeviceClient.getRetryAfterMs(unavailable({ "retry-after": "-1" })))
      .to.be.null;
    expect(DeviceClient.getRetryAfterMs(unavailable({ "retry-after": "" }))).to
      .be.null;
    expect(DeviceClient.getRetryAfterMs(new Error("network"))).to.be.null;
  });
});

describe("DeviceClient well-known eSCL capabilities probe", () => {
  const scannerCaps = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MaxHeight>3508</scan:MaxHeight>
    </scan:PlatenInputCaps>
  </scan:Platen>
</scan:ScannerCapabilities>`;

  it("returns the capabilities when an endpoint answers", async () => {
    mockEsclBaseDetection();
    nock("http://127.0.0.1")
      .get("/eSCL/ScanCapabilities")
      .reply(200, scannerCaps);

    const caps =
      await new DeviceClient("127.0.0.1").getEsclScanCapsFromWellKnownPath();

    expect(caps?.platenMaxWidth).to.equal(2550);
  });

  it("returns null when every candidate is missing", async () => {
    mockEsclBaseDetection();
    nock("http://127.0.0.1").get("/eSCL/ScanCapabilities").reply(404);
    nock("http://127.0.0.1").get("/eSCL/ScannerCapabilities").reply(405);

    const caps =
      await new DeviceClient("127.0.0.1").getEsclScanCapsFromWellKnownPath();

    expect(caps).to.be.null;
  });

  it("throws DeviceNotReadyError when a candidate is not ready", async () => {
    mockEsclBaseDetection();
    nock("http://127.0.0.1").get("/eSCL/ScanCapabilities").reply(404);
    nock("http://127.0.0.1").get("/eSCL/ScannerCapabilities").reply(403);

    const error = await rejectionOf(
      new DeviceClient("127.0.0.1").getEsclScanCapsFromWellKnownPath(),
    );

    expect(error).to.be.instanceOf(DeviceNotReadyError);
  });

  it("throws DeviceNotReadyError on a server error", async () => {
    mockEsclBaseDetection();
    nock("http://127.0.0.1").get("/eSCL/ScanCapabilities").reply(503);
    nock("http://127.0.0.1").get("/eSCL/ScannerCapabilities").reply(404);

    const error = await rejectionOf(
      new DeviceClient("127.0.0.1").getEsclScanCapsFromWellKnownPath(),
    );

    expect(error).to.be.instanceOf(DeviceNotReadyError);
  });

  it("throws DeviceNotReadyError on a network error", async () => {
    mockEsclBaseDetection();
    nock("http://127.0.0.1")
      .get("/eSCL/ScanCapabilities")
      .replyWithError("connection refused");
    nock("http://127.0.0.1").get("/eSCL/ScannerCapabilities").reply(404);

    const error = await rejectionOf(
      new DeviceClient("127.0.0.1").getEsclScanCapsFromWellKnownPath(),
    );

    expect(error).to.be.instanceOf(DeviceNotReadyError);
  });
});

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  expect.fail("Expected the promise to reject");
}

async function expectRejects(
  promise: Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  try {
    await promise;
    expect.fail("Expected the promise to reject");
  } catch (error) {
    expect((error as Error).message).to.match(expected);
  }
}
