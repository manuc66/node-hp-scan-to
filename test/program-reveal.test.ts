import { describe, it } from "mocha";
import { expect } from "chai";
import { getScanConfiguration, setupProgram } from "../src/program.js";
import type { ListenOptions } from "../src/program.js";
import { configSchema } from "../src/type/FileConfig.js";

describe("CLI Program - Reveal Option", () => {
  for (const commandName of ["listen", "adf-autoscan", "single-scan"]) {
    it(`parses --reveal on ${commandName}`, () => {
      const command = setupProgram({}).commands.find(
        (cmd) => cmd.name() === commandName,
      );
      expect(command, `Command not found: ${commandName}`).to.exist;
      command?.parseOptions(["--reveal"]);
      expect(command?.opts()).to.include({ reveal: true });
    });
  }

  it("carries --reveal into the scan config", () => {
    const options: ListenOptions = { reveal: true };
    expect(getScanConfiguration(options, {}).reveal).to.equal(true);
  });

  it("falls back to reveal in the config file", () => {
    expect(getScanConfiguration({}, { reveal: true }).reveal).to.equal(true);
  });

  it("leaves reveal off when neither the CLI nor the config sets it", () => {
    expect(getScanConfiguration({}, {}).reveal).to.equal(undefined);
    expect(getScanConfiguration({}, { reveal: false }).reveal).to.equal(
      undefined,
    );
  });

  it("accepts only a boolean reveal in the config file", () => {
    expect(configSchema.safeParse({ reveal: true }).success).to.equal(true);
    expect(configSchema.safeParse({ reveal: "yes" }).success).to.equal(false);
  });
});
