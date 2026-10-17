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
    it("should parse --post-command-pdf into a program and its arguments", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "listen", [
        "--post-command-pdf",
        'gswin64c -dPDFA=2 "{input}" -o "{output}"',
      ]);
      expect(opts?.["postCommandPdf"]).to.deep.equal([
        "gswin64c",
        "-dPDFA=2",
        "{input}",
        "-o",
        "{output}",
      ]);
    });

    it("should parse --post-command-image into a program and its arguments", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "listen", [
        "--post-command-image",
        'magick "{input}" "{output}"',
      ]);
      expect(opts?.["postCommandImage"]).to.deep.equal([
        "magick",
        "{input}",
        "{output}",
      ]);
    });
  });

  describe("single-scan command post command options", () => {
    it("should keep the PDF and image commands separate", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--post-command-pdf",
        'cp "{input}" "{output}"',
        "--post-command-image",
        'exiftool "{input}"',
      ]);
      expect(opts?.["postCommandPdf"]).to.deep.equal([
        "cp",
        "{input}",
        "{output}",
      ]);
      expect(opts?.["postCommandImage"]).to.deep.equal(["exiftool", "{input}"]);
    });

    it("should keep a quoted path with spaces in a single argument", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--post-command-image",
        'exiftool -title "My Scan" "{input}"',
      ]);
      expect(opts?.["postCommandImage"]).to.deep.equal([
        "exiftool",
        "-title",
        "My Scan",
        "{input}",
      ]);
    });
  });

  describe("adf-autoscan command post command options", () => {
    it("should parse --post-command-pdf into a program and its arguments", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "adf-autoscan", [
        "--post-command-pdf",
        'gswin64c -dPDFA=2 "{input}" -o "{output}"',
      ]);
      expect(opts?.["postCommandPdf"]).to.deep.equal([
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
    const cases: [string, string, string[]][] = [
      ["listen", "--post-command-pdf", ["gswin64c -dPDFA=2"]],
      ["single-scan", "--post-command-pdf", ["cp"]],
      ["single-scan", "--post-command-image", ["exiftool"]],
      ["adf-autoscan", "--post-command-image", ["magick"]],
    ];

    for (const [commandName, flag, values] of cases) {
      it(`should reject a ${commandName} ${flag} without {input}`, () => {
        const program = setupProgram(emptyConfig);
        const command = program.commands.find(
          (cmd) => cmd.name() === commandName,
        );
        expect(command, `Command not found: ${commandName}`).to.exist;

        expect(() => command?.parseOptions([flag, ...values])).to.throw();
      });
    }

    it("should accept a --post-command-image using {input}", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--post-command-image",
        "exiftool {input}",
      ]);
      expect(opts?.["postCommandImage"]).to.deep.equal(["exiftool", "{input}"]);
    });

    it("should reject a command whose only {input} is the program", () => {
      const program = setupProgram(emptyConfig);
      const command = program.commands.find(
        (cmd) => cmd.name() === "single-scan",
      );
      expect(command, "Command not found: single-scan").to.exist;

      expect(() =>
        command?.parseOptions(["--post-command-pdf", "{input} --flag"]),
      ).to.throw();
    });
  });

  describe("post command timeout", () => {
    it("parses --post-command-timeout as milliseconds", () => {
      const program = setupProgram(emptyConfig);
      const opts = parseSubcommandOptions(program, "single-scan", [
        "--post-command-image",
        "exiftool {input}",
        "--post-command-timeout",
        "60000",
      ]);
      expect(opts?.["postCommandTimeout"]).to.equal(60_000);
    });

    it("rejects a non-positive or non-integer --post-command-timeout", () => {
      for (const value of ["0", "-5", "1.5", "abc"]) {
        const program = setupProgram(emptyConfig);
        const command = program.commands.find(
          (cmd) => cmd.name() === "single-scan",
        );
        expect(command, "Command not found: single-scan").to.exist;
        expect(
          () => command?.parseOptions(["--post-command-timeout", value]),
          `value ${value}`,
        ).to.throw();
      }
    });
  });

  describe("Post Command Help Documentation", () => {
    for (const commandName of ["listen", "single-scan", "adf-autoscan"]) {
      it(`should include the post-command options in ${commandName} help`, () => {
        const program = setupProgram(emptyConfig);
        const command = program.commands.find(
          (cmd) => cmd.name() === commandName,
        );
        expect(command, `Command not found: ${commandName}`).to.exist;
        if (command) {
          const help = command.helpInformation();
          expect(help).to.include("--post-command-pdf");
          expect(help).to.include("--post-command-image");
          expect(help).to.include("--post-command-timeout");
        }
      });
    }
  });
});
