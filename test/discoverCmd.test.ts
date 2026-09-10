import { expect } from "chai";
import { readFile } from "fs/promises";
import nock from "nock";
import {
  discoverCmd,
  looksLikeHpScanDevice,
  type DiscoveredDevice,
  type DiscoverOptions,
} from "../src/commands/discoverCmd.js";

function captureConsole() {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    out.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    err.push(args.map(String).join(" "));
  };
  return {
    out,
    err,
    restore() {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

describe("discoverCmd", () => {
  describe("looksLikeHpScanDevice", () => {
    it("detects a real HP DiscoveryTree document", async () => {
      const content = await readFile("./test/asset/discoveryTree.xml", "utf-8");
      expect(looksLikeHpScanDevice(content)).to.equal(true);
    });

    it("rejects an XML without scan manifests", () => {
      const content = `<?xml version="1.0" encoding="UTF-8" ?>
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/2007/09/21">
    <ledm:SupportedIfc>
        <ledm:ManifestURI>/Copy/CopyManifest.xml</ledm:ManifestURI>
        <dd:ResourceType>ledm:hpLedmCopyManifest</dd:ResourceType>
    </ledm:SupportedIfc>
</ledm:DiscoveryTree>`;
      expect(looksLikeHpScanDevice(content)).to.equal(false);
    });

    it("rejects arbitrary non HP content", () => {
      expect(
        looksLikeHpScanDevice("<html><body>router admin</body></html>"),
      ).to.equal(false);
    });
  });

  describe("discoverCmd with an explicit ip", () => {
    let consoleCapture: ReturnType<typeof captureConsole>;

    beforeEach(() => {
      nock.cleanAll();
      nock.disableNetConnect();
      consoleCapture = captureConsole();
    });

    afterEach(() => {
      consoleCapture.restore();
      nock.cleanAll();
      nock.enableNetConnect();
    });

    it("reports the device when the DiscoveryTree exposes a scan manifest", async () => {
      const discoveryTree = await readFile(
        "./test/asset/discoveryTree.xml",
        "utf-8",
      );
      nock("http://192.168.1.42")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, discoveryTree);

      const exitCode = await discoverCmd({
        timeoutSeconds: 1,
        json: false,
        ip: "192.168.1.42",
      });

      expect(exitCode).to.equal(0);
      expect(consoleCapture.out).to.deep.equal(["192.168.1.42\t192.168.1.42"]);
    });

    it("outputs a JSON array with --json", async () => {
      const discoveryTree = await readFile(
        "./test/asset/discoveryTree.xml",
        "utf-8",
      );
      nock("http://192.168.1.42")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, discoveryTree);

      const exitCode = await discoverCmd({
        timeoutSeconds: 1,
        json: true,
        ip: "192.168.1.42",
      });

      expect(exitCode).to.equal(0);
      expect(JSON.parse(consoleCapture.out.join(""))).to.deep.equal([
        { name: "192.168.1.42", ip: "192.168.1.42" },
      ]);
    });

    it("fails when the device is not scan-capable", async () => {
      nock("http://192.168.1.42")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, "<html><body>router admin</body></html>");

      const exitCode = await discoverCmd({
        timeoutSeconds: 1,
        json: false,
        ip: "192.168.1.42",
      });

      expect(exitCode).to.equal(1);
      expect(consoleCapture.err.join("\n")).to.contain(
        "No HP scan-capable device found at 192.168.1.42",
      );
    });

    it("fails when the probe request errors", async () => {
      nock("http://192.168.1.42")
        .get("/DevMgmt/DiscoveryTree.xml")
        .replyWithError("connection refused");

      const exitCode = await discoverCmd({
        timeoutSeconds: 1,
        json: false,
        ip: "192.168.1.42",
      });

      expect(exitCode).to.equal(1);
      expect(consoleCapture.err.join("\n")).to.contain(
        "No HP scan-capable device found at 192.168.1.42",
      );
    });
  });

  describe("discoverCmd browsing the network", () => {
    let consoleCapture: ReturnType<typeof captureConsole>;

    beforeEach(() => {
      nock.cleanAll();
      nock.disableNetConnect();
      consoleCapture = captureConsole();
    });

    afterEach(() => {
      consoleCapture.restore();
      nock.cleanAll();
      nock.enableNetConnect();
    });

    it("probes candidates, applies the name filter and prints matches sorted", async () => {
      const discoveryTree = await readFile(
        "./test/asset/discoveryTree.xml",
        "utf-8",
      );
      const fakeBrowse = async (): Promise<DiscoveredDevice[]> => [
        { name: "HP OfficeJet 4650", ip: "10.0.0.2" },
        { name: "RouterAdmin", ip: "10.0.0.1" },
        { name: "HP DeskJet 2700", ip: "10.0.0.3" },
      ];
      nock("http://10.0.0.2")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, discoveryTree);
      nock("http://10.0.0.3")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, "<html>not a printer</html>");

      const options: DiscoverOptions = {
        timeoutSeconds: 1,
        json: false,
        name: "hp",
      };
      const exitCode = await discoverCmd(options, fakeBrowse);

      expect(exitCode).to.equal(0);
      expect(consoleCapture.err.join("\n")).to.contain(
        "Probing 2 candidate(s)...",
      );
      expect(consoleCapture.out).to.deep.equal([
        "HP OfficeJet 4650\t10.0.0.2",
      ]);
    });

    it("prints scan-capable devices sorted by name", async () => {
      const discoveryTree = await readFile(
        "./test/asset/discoveryTree.xml",
        "utf-8",
      );
      const fakeBrowse = async (): Promise<DiscoveredDevice[]> => [
        { name: "HP OfficeJet 4650", ip: "10.0.0.2" },
        { name: "HP DeskJet 2700", ip: "10.0.0.3" },
      ];
      nock("http://10.0.0.2")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, discoveryTree);
      nock("http://10.0.0.3")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, discoveryTree);

      const exitCode = await discoverCmd(
        { timeoutSeconds: 1, json: false },
        fakeBrowse,
      );

      expect(exitCode).to.equal(0);
      expect(consoleCapture.out).to.deep.equal([
        "HP DeskJet 2700\t10.0.0.3",
        "HP OfficeJet 4650\t10.0.0.2",
      ]);
    });

    it("prints scan-capable devices as JSON with --json", async () => {
      const discoveryTree = await readFile(
        "./test/asset/discoveryTree.xml",
        "utf-8",
      );
      const fakeBrowse = async (): Promise<DiscoveredDevice[]> => [
        { name: "HP OfficeJet 4650", ip: "10.0.0.2" },
      ];
      nock("http://10.0.0.2")
        .get("/DevMgmt/DiscoveryTree.xml")
        .reply(200, discoveryTree);

      const exitCode = await discoverCmd(
        { timeoutSeconds: 1, json: true },
        fakeBrowse,
      );

      expect(exitCode).to.equal(0);
      expect(JSON.parse(consoleCapture.out.join(""))).to.deep.equal([
        { name: "HP OfficeJet 4650", ip: "10.0.0.2" },
      ]);
    });

    it("returns 1 when no candidate answers within the (zero) browsing window", async () => {
      const exitCode = await discoverCmd({
        timeoutSeconds: 0,
        json: false,
      });

      expect(exitCode).to.equal(1);
      expect(consoleCapture.err.join("\n")).to.contain(
        "Probing 0 candidate(s)...",
      );
      expect(consoleCapture.err.join("\n")).to.contain(
        "No HP scan-capable device found",
      );
    });
  });
});
