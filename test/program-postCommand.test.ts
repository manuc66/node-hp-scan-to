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
    it("should parse --post-command into a program and its arguments", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "listen", [
        "--post-command",
        'gswin64c -dPDFA=2 "{input}" -o "{output}"',
      ]);
      expect(opts?.["postCommand"]).to.deep.equal([
        "gswin64c",
        "-dPDFA=2",
        "{input}",
        "-o",
        "{output}",
      ]);
    });
  });

  describe("single-scan command post command options", () => {
    it("should parse --post-command into a program and its arguments", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--post-command",
        'cp "{input}" "{output}"',
      ]);
      expect(opts?.["postCommand"]).to.deep.equal([
        "cp",
        "{input}",
        "{output}",
      ]);
    });

    it("should keep a quoted path with spaces in a single argument", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--post-command",
        'exiftool -title "My Scan" "{input}"',
      ]);
      expect(opts?.["postCommand"]).to.deep.equal([
        "exiftool",
        "-title",
        "My Scan",
        "{input}",
      ]);
    });
  });

  describe("adf-autoscan command post command options", () => {
    it("should parse --post-command into a program and its arguments", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "adf-autoscan", [
        "--post-command",
        'gswin64c -dPDFA=2 "{input}" -o "{output}"',
      ]);
      expect(opts?.["postCommand"]).to.deep.equal([
        "gswin64c",
        "-dPDFA=2",
        "{input}",
        "-o",
        "{output}",
      ]);
    });
  });

  describe("post command without a {input} placeholder", () => {
    // A command that never receives {input} can only run by accident: the
    // user almost certainly forgot the placeholder, and the hook silently
    // does something unrelated to the scan on every single file.
    const cases: [string, string[]][] = [
      ["listen", ["--post-command", "gswin64c -dPDFA=2"]],
      ["single-scan", ["--post-command", "cp"]],
      ["adf-autoscan", ["--post-command", "exiftool"]],
    ];

    for (const [commandName, args] of cases) {
      it(`should reject a ${commandName} --post-command without {input}`, () => {
        const program = setupProgram(emptyConfig);
        const command = program.commands.find(
          (cmd) => cmd.name() === commandName,
        );
        expect(command, `Command not found: ${commandName}`).to.exist;

        expect(() => command?.parseOptions(args)).to.throw();
      });
    }

    it("should accept a --post-command using {input}", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--post-command",
        "exiftool {input}",
      ]);
      expect(opts?.["postCommand"]).to.deep.equal(["exiftool", "{input}"]);
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
