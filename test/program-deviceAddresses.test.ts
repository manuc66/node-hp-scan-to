import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import nock from "nock";
import {
  findFirstUsableIp,
  getDeviceIp,
  type ProgramOption,
} from "../src/program.js";
import type { FileConfig } from "../src/type/FileConfig.js";

const SCANNER_XML =
  '<?xml version="1.0"?>' +
  '<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" ' +
  'xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">' +
  "<pwg:Version>2.63</pwg:Version>" +
  "<pwg:State>Idle</pwg:State>" +
  "<scan:AdfState>ScannerAdfEmpty</scan:AdfState>" +
  "</scan:ScannerStatus>";

function mockScanner(address: string) {
  nock(`http://${address}`)
    .get("/eSCL/ScannerStatus")
    .reply(200, SCANNER_XML, { "Content-Type": "application/xml" });
}

function mockWebServer(address: string) {
  nock(`http://${address}`)
    .get("/eSCL/ScannerStatus")
    .reply(200, "<html>router admin page</html>", {
      "Content-Type": "text/html",
    });
}

function mockUnreachable(address: string) {
  nock(`http://${address}`)
    .get("/eSCL/ScannerStatus")
    .replyWithError("ECONNREFUSED");
}

describe("device address resolution", () => {
  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("findFirstUsableIp", () => {
    it("returns the first address that exposes an eSCL scanner, in order", async () => {
      mockScanner("192.0.2.1");
      mockUnreachable("192.0.2.2");
      const result = await findFirstUsableIp(["192.0.2.1", "192.0.2.2"]);
      expect(result).to.equal("192.0.2.1");
    });

    it("skips a non-scanner web server and returns the first scanner", async () => {
      mockWebServer("192.0.2.1");
      mockScanner("192.0.2.2");
      const result = await findFirstUsableIp(["192.0.2.1", "192.0.2.2"]);
      expect(result).to.equal("192.0.2.2");
    });

    it("returns undefined when no address is usable", async () => {
      mockWebServer("192.0.2.1");
      mockUnreachable("192.0.2.2");
      const result = await findFirstUsableIp(["192.0.2.1", "192.0.2.2"]);
      expect(result).to.be.undefined;
    });

    it("returns undefined for an empty list", async () => {
      const result = await findFirstUsableIp([]);
      expect(result).to.be.undefined;
    });
  });

  describe("getDeviceIp precedence", () => {
    const emptyOptions = {} as ProgramOption;

    it("prefers ip over device_addresses", async () => {
      const config: FileConfig = {
        ip: "10.0.0.99",
        device_addresses: ["192.0.2.1"],
      };
      const result = await getDeviceIp(emptyOptions, config);
      expect(result).to.equal("10.0.0.99");
    });

    it("uses device_addresses when ip is absent", async () => {
      mockScanner("192.0.2.1");
      const config: FileConfig = {
        device_addresses: ["192.0.2.1"],
      };
      const result = await getDeviceIp(emptyOptions, config);
      expect(result).to.equal("192.0.2.1");
    });
  });
});
