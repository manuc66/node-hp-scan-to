import { describe, it } from "mocha";
import { expect } from "chai";
import { setupProgram } from "../src/program.js";
import type { FileConfig } from "../src/type/FileConfig.js";

function parseSubcommandOptions(
  program: ReturnType<typeof setupProgram>,
  commandName: string,
  args: string[],
) {
  const command = program.commands.find((cmd) => cmd.name() === commandName);
  expect(command, `Command not found: ${commandName}`).to.exist;
  command?.parseOptions(args);
  return command?.opts();
}

describe("CLI Program - Paper Size Options", () => {
  const emptyConfig: FileConfig = {};

  describe("listen command paper size options", async () => {
    it("should parse --paper-size option", async () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "listen", [
        "--paper-size",
        "Letter",
      ]);
      expect(opts?.["paperSize"]).to.equal("Letter");
    });

    it("should parse --paper-dim option", async () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "listen", [
        "--paper-dim",
        "21x29.7cm",
      ]);
      expect(opts?.["paperDim"]).to.equal("21x29.7cm");
    });

    it("should parse --paper-size case-insensitively", async () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "listen", [
        "--paper-size",
        "a4",
      ]);
      expect(opts?.["paperSize"]).to.equal("a4");
    });

    it("should accept various paper size presets", async () => {
      const presets = ["A4", "Letter", "Legal", "A5", "B5", "Max"];
      for (const preset of presets) {
        const program = setupProgram(emptyConfig);
        const opts = parseSubcommandOptions(program, "listen", [
          "--paper-size",
          preset,
        ]);
        expect(opts?.["paperSize"]).to.equal(preset);
      }
    });

    it("should accept various custom dimension formats", async () => {
      const dimensions = ["21x29.7cm", "8.5x11in", "210x297mm", "21x29.7cm"];
      for (const dim of dimensions) {
        const program = setupProgram(emptyConfig);
        const opts = parseSubcommandOptions(program, "listen", [
          "--paper-dim",
          dim,
        ]);
        expect(opts?.["paperDim"]).to.equal(dim);
      }
    });
  });

  describe("single-scan command paper size options", async () => {
    it("should parse --paper-size option", async () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--paper-size",
        "A4",
      ]);
      expect(opts?.["paperSize"]).to.equal("A4");
    });

    it("should parse --paper-dim option", async () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--paper-dim",
        "8.5x11in",
      ]);
      expect(opts?.["paperDim"]).to.equal("8.5x11in");
    });
  });

  describe("adf-autoscan command paper size options", async () => {
    it("should parse --paper-size option", async () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "adf-autoscan", [
        "--paper-size",
        "Legal",
      ]);
      expect(opts?.["paperSize"]).to.equal("Legal");
    });

    it("should parse --paper-dim option", async () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "adf-autoscan", [
        "--paper-dim",
        "210x297mm",
      ]);
      expect(opts?.["paperDim"]).to.equal("210x297mm");
    });
  });

  describe("config file paper size support", async () => {
    it("should read paper_size from config file", async () => {
      const config: FileConfig = {
        paper_size: "A4",
      };
      const program = setupProgram(config);
      const opts = parseSubcommandOptions(program, "listen", []);
      // Without CLI option, should fall back to config
      expect(opts?.["paperSize"]).to.be.undefined;
    });

    it("should read paper_dim from config file", async () => {
      const config: FileConfig = {
        paper_dim: "21x29.7cm",
      };
      const program = setupProgram(config);
      const opts = parseSubcommandOptions(program, "listen", []);
      // Without CLI option, should fall back to config
      expect(opts?.["paperDim"]).to.be.undefined;
    });

    it("should prefer CLI option over config file", async () => {
      const config: FileConfig = {
        paper_size: "A4",
      };
      const program = setupProgram(config);
      const opts = parseSubcommandOptions(program, "listen", [
        "--paper-size",
        "Letter",
      ]);
      expect(opts?.["paperSize"]).to.equal("Letter");
    });
  });

  describe("Paper Size Help Documentation", async () => {
    it("should include paper-size in listen command help", async () => {
      const program = setupProgram(emptyConfig);
      const listenCmd = program.commands.find((cmd) => cmd.name() === "listen");
      expect(listenCmd).to.exist;
      if (listenCmd) {
        const help = listenCmd.helpInformation();
        expect(help).to.include("--paper-size");
        expect(help).to.include("--paper-dim");
      }
    });
  });
});
