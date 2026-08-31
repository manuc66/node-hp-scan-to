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

describe("CLI Program - Post Command Options", () => {
  const emptyConfig: FileConfig = {};

  describe("listen command post command options", () => {
    it("should parse --post-command option", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "listen", [
        "--post-command",
        'gswin64c -dPDFA=2 "{input}" -o "{output}"',
      ]);
      expect(opts?.["postCommand"]).to.equal(
        'gswin64c -dPDFA=2 "{input}" -o "{output}"',
      );
    });
  });

  describe("single-scan command post command options", () => {
    it("should parse --post-command option", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--post-command",
        'cp "{input}" "{output}"',
      ]);
      expect(opts?.["postCommand"]).to.equal('cp "{input}" "{output}"');
    });
  });

  describe("adf-autoscan command post command options", () => {
    it("should parse --post-command option", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "adf-autoscan", [
        "--post-command",
        'gswin64c -dPDFA=2 "{input}" -o "{output}"',
      ]);
      expect(opts?.["postCommand"]).to.equal(
        'gswin64c -dPDFA=2 "{input}" -o "{output}"',
      );
    });
  });

  describe("Post Command Help Documentation", () => {
    it("should include post-command in listen command help", () => {
      const program = setupProgram(emptyConfig);
      const listenCmd = program.commands.find((cmd) => cmd.name() === "listen");
      expect(listenCmd).to.exist;
      if (listenCmd) {
        const help = listenCmd.helpInformation();
        expect(help).to.include("--post-command");
      }
    });

    it("should include post-command in single-scan command help", () => {
      const program = setupProgram(emptyConfig);
      const singleCmd = program.commands.find(
        (cmd) => cmd.name() === "single-scan",
      );
      expect(singleCmd).to.exist;
      if (singleCmd) {
        const help = singleCmd.helpInformation();
        expect(help).to.include("--post-command");
      }
    });

    it("should include post-command in adf-autoscan command help", () => {
      const program = setupProgram(emptyConfig);
      const adfCmd = program.commands.find(
        (cmd) => cmd.name() === "adf-autoscan",
      );
      expect(adfCmd).to.exist;
      if (adfCmd) {
        const help = adfCmd.helpInformation();
        expect(help).to.include("--post-command");
      }
    });
  });
});