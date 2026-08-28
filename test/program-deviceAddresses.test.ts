import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import net from "node:net";
import type { Server } from "node:net";
import {
  findFirstUsableIp,
  getDeviceIp,
  type ProgramOption,
} from "../src/program.js";
import type { FileConfig } from "../src/type/FileConfig.js";

function startEchoServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.end());
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ server, port });
    });
  });
}

describe("device address resolution", () => {
  let server: Server | undefined;
  let openPort: number;

  before(async () => {
    ({ server, port: openPort } = await startEchoServer());
  });

  after(() => {
    server?.close();
  });

  describe("findFirstUsableIp", () => {
    it("returns the first usable address in order", async () => {
      const result = await findFirstUsableIp(
        ["127.0.0.1", "127.0.0.2"],
        openPort,
      );
      expect(result).to.equal("127.0.0.1");
    });

    it("skips unreachable addresses and returns the first usable one", async () => {
      const result = await findFirstUsableIp(
        ["127.0.0.2", "127.0.0.1"],
        openPort,
      );
      expect(result).to.equal("127.0.0.1");
    });

    it("returns undefined when no address is reachable", async () => {
      const result = await findFirstUsableIp(
        ["127.0.0.2", "127.0.0.3"],
        openPort,
      );
      expect(result).to.be.undefined;
    });

    it("returns undefined for an empty list", async () => {
      const result = await findFirstUsableIp([], openPort);
      expect(result).to.be.undefined;
    });
  });

  describe("getDeviceIp precedence", () => {
    const emptyOptions = {} as ProgramOption;

    it("prefers ip over device_addresses", async () => {
      const config: FileConfig = {
        ip: "10.0.0.99",
        device_addresses: ["127.0.0.1"],
      };
      const result = await getDeviceIp(emptyOptions, config, openPort);
      expect(result).to.equal("10.0.0.99");
    });

    it("uses device_addresses when ip is absent", async () => {
      const config: FileConfig = {
        device_addresses: ["127.0.0.2", "127.0.0.1"],
      };
      const result = await getDeviceIp(emptyOptions, config, openPort);
      expect(result).to.equal("127.0.0.1");
    });
  });
});
