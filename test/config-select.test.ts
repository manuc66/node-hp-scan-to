import { describe, it } from "mocha";
import { expect } from "chai";
import { resolveConfig } from "../src/config/resolve.js";
import {
  buildListenTargets,
  selectSingleTarget,
  type ListenRegistrationOptions,
} from "../src/config/select.js";
import { DuplexAssemblyMode } from "../src/type/DuplexAssemblyMode.js";

const noOptions: ListenRegistrationOptions = {
  label: undefined,
  addEmulatedDuplex: undefined,
  emulatedDuplexLabel: undefined,
};

describe("buildListenTargets - legacy configuration", () => {
  it("builds one simplex registration from the flat settings", () => {
    const printer = resolveConfig({ label: "Host" }).printers[0];
    const targets = buildListenTargets(printer, noOptions);

    expect(targets).to.have.length(1);
    expect(targets[0].registration).to.deep.equal({
      label: "Host",
      isDuplexSingleSide: false,
    });
  });

  it("keeps the emulated duplex registration declared in the file", () => {
    const printer = resolveConfig({
      label: "Host",
      add_emulated_duplex: true,
      emulated_duplex_assembly_mode: "page-wise",
    }).printers[0];
    const targets = buildListenTargets(printer, noOptions);

    expect(targets.map((target) => target.registration.label)).to.deep.equal([
      "Host",
      "Host duplex",
    ]);
    expect(targets[1].registration.duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.PAGE_WISE,
    );
  });

  it("defaults a file-declared emulated duplex to document-wise", () => {
    const printer = resolveConfig({ add_emulated_duplex: true }).printers[0];
    const targets = buildListenTargets(printer, noOptions);

    expect(targets[1].registration.duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.DOCUMENT_WISE,
    );
  });

  it("enables emulated duplex from the CLI", () => {
    const printer = resolveConfig({ label: "Host" }).printers[0];
    const targets = buildListenTargets(printer, {
      ...noOptions,
      addEmulatedDuplex: true,
    });

    expect(targets).to.have.length(2);
    expect(targets[1].registration.label).to.equal("Host duplex");
    expect(targets[1].registration.duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.DOCUMENT_WISE,
    );
  });

  it("honours the CLI assembly mode and duplex label", () => {
    const printer = resolveConfig({ label: "Host" }).printers[0];
    const targets = buildListenTargets(printer, {
      label: undefined,
      addEmulatedDuplex: DuplexAssemblyMode.REVERSE_BOTH,
      emulatedDuplexLabel: "Both sides",
    });

    expect(targets[1].registration.label).to.equal("Both sides");
    expect(targets[1].registration.duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.REVERSE_BOTH,
    );
  });

  it("derives the default duplex label from the CLI label", () => {
    const printer = resolveConfig({}).printers[0];
    const targets = buildListenTargets(printer, {
      ...noOptions,
      label: "New name",
      addEmulatedDuplex: true,
    });

    expect(targets[1].registration.label).to.equal("New name duplex");
  });

  it("keeps the historical precedence of a bare --add-emulated-duplex", () => {
    const printer = resolveConfig({
      add_emulated_duplex: true,
      emulated_duplex_assembly_mode: "page-wise",
    }).printers[0];
    const targets = buildListenTargets(printer, {
      ...noOptions,
      addEmulatedDuplex: true,
    });

    expect(targets[1].registration.duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.DOCUMENT_WISE,
    );
  });
});

describe("buildListenTargets - explicit targets", () => {
  it("registers every configured label with its own pipeline", () => {
    const printer = resolveConfig({
      profiles: {
        a: { directory: "/a" },
        b: { directory: "/b" },
      },
      targets: {
        A: { profile: "a" },
        B: { profile: "b", duplex: "emulated" },
      },
    }).printers[0];
    const targets = buildListenTargets(printer, noOptions);

    expect(targets.map((target) => target.registration.label)).to.deep.equal([
      "A",
      "B",
    ]);
    expect(targets[0].config.directory).to.equal("/a");
    expect(targets[1].config.directory).to.equal("/b");
    expect(targets[1].registration.isDuplexSingleSide).to.equal(true);
  });

  it("rejects the legacy registration flags", () => {
    const printer = resolveConfig({ targets: { A: {} } }).printers[0];

    expect(() =>
      buildListenTargets(printer, { ...noOptions, label: "Renamed" }),
    ).to.throw(/cannot be used/);
    expect(() =>
      buildListenTargets(printer, { ...noOptions, addEmulatedDuplex: true }),
    ).to.throw(/cannot be used/);
    expect(() =>
      buildListenTargets(printer, { ...noOptions, emulatedDuplexLabel: "X" }),
    ).to.throw(/cannot be used/);
  });
});

describe("selectSingleTarget", () => {
  it("returns the only target", () => {
    const printer = resolveConfig({ label: "Host" }).printers[0];

    expect(selectSingleTarget(printer).label).to.equal("Host");
  });

  it("refuses to guess when several targets are configured", () => {
    const printer = resolveConfig({ targets: { A: {}, B: {} } }).printers[0];

    expect(() => selectSingleTarget(printer)).to.throw(/A, B/);
  });
});
