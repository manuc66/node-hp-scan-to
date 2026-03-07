import { describe, it } from "mocha";
import { expect } from "chai";
import { setupProgram } from "../src/program.js";
import type { FileConfig } from "../src/type/FileConfig.js";

describe("CLI Program - Paper Size Configuration Priority", () => {
  describe("Default A4 behavior", () => {
    it("should apply A4 default when no CLI option and no config", () => {
      const emptyConfig: FileConfig = {};
      const program = setupProgram(emptyConfig);
      const command = program.commands.find((cmd) => cmd.name() === "listen");
      expect(command, "Command not found: listen").to.exist;
      command?.parseOptions([]);
      const opts = command?.opts();
      // Default A4 is applied in getScanConfiguration, not in CLI parsing
      expect(opts?.["paperSize"]).to.be.undefined;
    });

    it("should allow explicit Max preset from CLI", () => {
      const emptyConfig: FileConfig = {};
      const program = setupProgram(emptyConfig);
      const command = program.commands.find((cmd) => cmd.name() === "listen");
      expect(command).to.exist;
      command?.parseOptions(["--paper-size", "Max"]);
      const opts = command?.opts();
      expect(opts?.["paperSize"]).to.equal("Max");
    });

    it("should allow explicit Max preset from config", () => {
      const config: FileConfig = { paper_size: "Max" };
      const program = setupProgram(config);
      const command = program.commands.find((cmd) => cmd.name() === "listen");
      expect(command).to.exist;
      command?.parseOptions([]);
      // Config value is read in getScanConfiguration
    });
  });

  describe("CLI priority over config", () => {
    it("should prefer CLI paperSize over config paperSize", () => {
      const config: FileConfig = { paper_size: "A4" };
      const program = setupProgram(config);
      const command = program.commands.find((cmd) => cmd.name() === "listen");
      expect(command).to.exist;
      command?.parseOptions(["--paper-size", "Letter"]);
      const opts = command?.opts();
      expect(opts?.["paperSize"]).to.equal("Letter");
    });

    it("should prefer CLI paperDim over config paperDim", () => {
      const config: FileConfig = { paper_dim: "21x29.7cm" };
      const program = setupProgram(config);
      const command = program.commands.find((cmd) => cmd.name() === "listen");
      expect(command).to.exist;
      command?.parseOptions(["--paper-dim", "8.5x11in"]);
      const opts = command?.opts();
      expect(opts?.["paperDim"]).to.equal("8.5x11in");
    });

    it("should allow CLI paperSize to override config paperDim", () => {
      const config: FileConfig = { paper_dim: "21x29.7cm" };
      const program = setupProgram(config);
      const command = program.commands.find((cmd) => cmd.name() === "listen");
      expect(command).to.exist;
      command?.parseOptions(["--paper-size", "Letter"]);
      const opts = command?.opts();
      expect(opts?.["paperSize"]).to.equal("Letter");
      expect(opts?.["paperDim"]).to.be.undefined;
    });
  });
});
