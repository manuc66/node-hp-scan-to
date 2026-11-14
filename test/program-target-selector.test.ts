import { describe, it } from "mocha";
import { expect } from "chai";
import { resolveConfig } from "../src/config/resolve.js";
import { setupProgram } from "../src/program.js";

async function parseExpectingError(
  config: unknown,
  argv: string[],
  pattern: RegExp,
): Promise<void> {
  const program = setupProgram(resolveConfig(config));

  let failure: unknown;
  try {
    await program.parseAsync(["node", "test", ...argv]);
  } catch (error) {
    failure = error;
  }

  expect(
    failure,
    `expected "${argv.join(" ")}" to be rejected`,
  ).to.be.instanceOf(Error);
  expect((failure as Error).message).to.match(pattern);
}

const twoTargets = { ip: "127.0.0.1", targets: { A: {}, B: {} } };

describe("CLI target selector", () => {
  it("is available on listen, adf-autoscan and single-scan", () => {
    const program = setupProgram(resolveConfig({}));

    for (const commandName of ["listen", "adf-autoscan", "single-scan"]) {
      const command = program.commands.find(
        (cmd) => cmd.name() === commandName,
      );
      expect(command, `Command not found: ${commandName}`).to.exist;
      command?.parseOptions(["--target", "Selected"]);
      expect(command?.opts()["target"]).to.equal("Selected");
    }
  });

  it("rejects an unknown label on single-scan", async () => {
    await parseExpectingError(
      twoTargets,
      ["single-scan", "--target", "Nope"],
      /unknown target "Nope".*A, B/,
    );
  });

  it("rejects an unknown label on adf-autoscan", async () => {
    await parseExpectingError(
      twoTargets,
      ["adf-autoscan", "--target", "Nope"],
      /unknown target "Nope".*A, B/,
    );
  });

  it("rejects an unknown label on listen", async () => {
    await parseExpectingError(
      twoTargets,
      ["listen", "--target", "Nope"],
      /unknown target "Nope".*A, B/,
    );
  });

  it("asks for a selector when several targets exist and none is given", async () => {
    await parseExpectingError(
      twoTargets,
      ["single-scan"],
      /several scan targets are configured.*--target/,
    );
  });

  it("keeps the legacy behaviour when the selector is omitted", async () => {
    const legacy = { ip: "127.0.0.1", label: "Only one" };

    await parseExpectingError(
      legacy,
      ["single-scan", "--target", "Nope"],
      /unknown target "Nope".*Only one/,
    );
  });
});

const twoPrinters = {
  printers: {
    officejet: { ip: "127.0.0.1", targets: { A: {} } },
    deskjet: { ip: "127.0.0.2", targets: { B: {} } },
  },
};

describe("CLI printer selector", () => {
  it("is available as a global option", () => {
    const program = setupProgram(resolveConfig({}));
    program.parseOptions(["--printer", "officejet"]);

    expect(program.opts().printer).to.equal("officejet");
  });

  it("rejects an unknown printer", async () => {
    await parseExpectingError(
      twoPrinters,
      ["single-scan", "--printer", "nope"],
      /unknown printer "nope".*officejet, deskjet/,
    );
  });

  it("asks for a printer when several are configured", async () => {
    await parseExpectingError(
      twoPrinters,
      ["listen"],
      /several printers are configured.*--printer/,
    );
  });

  it("rejects --address with a printers block", async () => {
    await parseExpectingError(
      twoPrinters,
      ["single-scan", "--printer", "officejet", "--address", "127.0.0.9"],
      /--address and --name cannot be used/,
    );
  });

  it("rejects --name with a printers block", async () => {
    await parseExpectingError(
      twoPrinters,
      ["single-scan", "--printer", "officejet", "--name", "Officejet"],
      /--address and --name cannot be used/,
    );
  });

  it("keeps --address working with a flat configuration", async () => {
    await parseExpectingError(
      { label: "Only one" },
      ["single-scan", "--address", "127.0.0.1", "--target", "Nope"],
      /unknown target "Nope"/,
    );
  });
});
