import { describe, it } from "mocha";
import { expect } from "chai";
import { resolveConfig } from "../src/config/resolve.js";
import {
  buildListenTargets,
  selectListenTargets,
  selectTarget,
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

describe("selectTarget", () => {
  it("returns the only target when no label is given", () => {
    const printer = resolveConfig({ label: "Host" }).printers[0];

    expect(selectTarget(printer, undefined).label).to.equal("Host");
  });

  it("selects a target by label", () => {
    const printer = resolveConfig({
      directory: "/flat",
      profiles: { archive: { directory: "/archive" } },
      targets: {
        Paperless: { profile: "default" },
        Archive: { profile: "archive" },
      },
    }).printers[0];

    expect(selectTarget(printer, "Archive").config.directory).to.equal(
      "/archive",
    );
  });

  it("rejects an unknown label and lists the configured ones", () => {
    const printer = resolveConfig({ targets: { A: {}, B: {} } }).printers[0];

    expect(() => selectTarget(printer, "Nope")).to.throw(
      /unknown target "Nope".*A, B/,
    );
  });

  it("refuses to guess when several targets are configured", () => {
    const printer = resolveConfig({ targets: { A: {}, B: {} } }).printers[0];

    expect(() => selectTarget(printer, undefined)).to.throw(/--target/);
  });
});

describe("selectListenTargets", () => {
  const legacyPrinter = resolveConfig({
    label: "Host",
    add_emulated_duplex: true,
  }).printers[0];

  it("keeps every target when no label is given", () => {
    const targets = buildListenTargets(legacyPrinter, noOptions);

    expect(selectListenTargets(targets, undefined)).to.deep.equal(targets);
  });

  it("keeps the legacy registrations untouched without a selector", () => {
    const targets = buildListenTargets(legacyPrinter, noOptions);

    expect(targets.map((target) => target.registration.label)).to.deep.equal([
      "Host",
      "Host duplex",
    ]);
    expect(selectListenTargets(targets, undefined)).to.deep.equal(targets);
  });

  it("keeps only the requested label", () => {
    const targets = buildListenTargets(legacyPrinter, noOptions);
    const selected = selectListenTargets(targets, "Host duplex");

    expect(selected).to.have.length(1);
    expect(selected[0].registration.label).to.equal("Host duplex");
  });

  it("rejects an unknown label", () => {
    const targets = buildListenTargets(legacyPrinter, noOptions);

    expect(() => selectListenTargets(targets, "Nope")).to.throw(
      /unknown target "Nope".*Host, Host duplex/,
    );
  });
});
