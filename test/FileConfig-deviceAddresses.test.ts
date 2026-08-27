import { describe, it } from "mocha";
import { expect } from "chai";
import { configSchema } from "../src/type/FileConfig.js";

describe("FileConfig - device address list", () => {
  describe("Valid configurations", () => {
    it("should accept device_addresses as a list of strings", () => {
      const config = {
        device_addresses: ["192.168.1.53", "192.168.1.54"],
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });

    it("should accept device_addresses together with ip", () => {
      const config = {
        ip: "192.168.1.53",
        device_addresses: ["192.168.1.53", "192.168.1.54"],
      };
      const result = configSchema.safeParse(config);
      expect(result.success).to.be.true;
    });
  });

  describe("Defaults", () => {
    it("should leave device_addresses undefined when absent", () => {
      const result = configSchema.safeParse({ ip: "192.168.1.53" });
      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.device_addresses).to.be.undefined;
      }
    });
  });
});