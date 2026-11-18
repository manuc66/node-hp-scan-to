import { describe, it } from "mocha";
import { expect } from "chai";
import { resolveConfig } from "../src/config/resolve.js";
import { buildResolveView, formatResolveView } from "../src/config/inspect.js";

describe("config resolve view", () => {
  it("shows the legacy target with its secret redacted", () => {
    const view = buildResolveView(
      resolveConfig({
        label: "Host",
        directory: "/scans",
        paperless_token: "super-secret",
      }),
    );

    expect(view.printers).to.have.length(1);
    expect(view.printers[0].id).to.equal("default");
    expect(view.printers[0].targets).to.have.length(1);

    const target = view.printers[0].targets[0];
    expect(target.label).to.equal("Host");
    expect(target.duplex).to.equal("simplex");
    expect(target.config["directory"]).to.equal("/scans");
    expect(target.config["paperless_token"]).to.equal("***");
  });

  it("keeps only the origin of the webhook URL", () => {
    const view = buildResolveView(
      resolveConfig({
        webhook_url:
          "https://hooks.example.tld/services/T000/B000/secret-token",
      }),
    );

    expect(view.printers[0].targets[0].config["webhook_url"]).to.equal(
      "https://hooks.example.tld/***",
    );
  });

  it("masks an unparsable webhook URL", () => {
    const view = buildResolveView(
      resolveConfig({ webhook_url: "not a valid url" }),
    );

    expect(view.printers[0].targets[0].config["webhook_url"]).to.equal("***");
  });

  it("strips credentials embedded in URLs", () => {
    const view = buildResolveView(
      resolveConfig({
        nextcloud_url:
          "https://user:pass@cloud.example/remote.php/dav/files/user",
        s3_url: "https://key:secret@s3.example/bucket",
        paperless_post_document_url: "https://user:pass@paperless.example/api/",
      }),
    );
    const config = view.printers[0].targets[0].config;

    expect(config["nextcloud_url"]).to.equal(
      "https://cloud.example/remote.php/dav/files/user",
    );
    expect(config["s3_url"]).to.equal("https://s3.example/bucket");
    expect(config["paperless_post_document_url"]).to.equal(
      "https://paperless.example/api/",
    );
  });

  it("keeps URLs without embedded credentials unchanged", () => {
    const url = "https://cloud.example/remote.php/dav/files/user";
    const view = buildResolveView(resolveConfig({ nextcloud_url: url }));

    expect(view.printers[0].targets[0].config["nextcloud_url"]).to.equal(url);
  });

  it("masks an unparsable credential URL", () => {
    const view = buildResolveView(
      resolveConfig({ nextcloud_url: "not a valid url" }),
    );

    expect(view.printers[0].targets[0].config["nextcloud_url"]).to.equal("***");
  });

  it("shows emulated duplex targets and their assembly mode", () => {
    const view = buildResolveView(
      resolveConfig({
        label: "Host",
        add_emulated_duplex: true,
        emulated_duplex_assembly_mode: "page-wise",
      }),
    );

    expect(
      view.printers[0].targets.map((target) => target.duplex),
    ).to.deep.equal(["simplex", "emulated"]);
    expect(view.printers[0].targets[1].assembly_mode).to.equal("page-wise");
  });

  it("shows the values inherited through defaults and extends", () => {
    const view = buildResolveView(
      resolveConfig({
        defaults: { resolution: 300 },
        profiles: {
          base: { directory: "/base", paperless_token: "super-secret" },
          paperless: { extends: "base", mode: "gray", paperless_token: null },
        },
        targets: { P: { profile: "paperless" } },
      }),
    );

    const config = view.printers[0].targets[0].config;
    expect(config["directory"]).to.equal("/base");
    expect(config["resolution"]).to.equal(300);
    expect(config["mode"]).to.equal("Gray");
    expect(config["paperless_token"]).to.equal(undefined);
  });

  it("shows every printer and filters by printer id", () => {
    const config = resolveConfig({
      printers: {
        officejet: { ip: "192.168.1.5", targets: { Scan: {} } },
        deskjet: { ip: "192.168.1.6", targets: { Archive: {} } },
      },
    });

    expect(
      buildResolveView(config).printers.map((printer) => printer.id),
    ).to.deep.equal(["officejet", "deskjet"]);
    expect(
      buildResolveView(config, { printer: "deskjet" }).printers.map(
        (printer) => printer.id,
      ),
    ).to.deep.equal(["deskjet"]);
  });

  it("filters by target label across the selected printers", () => {
    const config = resolveConfig({
      printers: {
        a: { ip: "1.1.1.1", targets: { Scan: {}, Archive: {} } },
        b: { ip: "2.2.2.2", targets: { Scan: {} } },
      },
    });

    const view = buildResolveView(config, { target: "Scan" });
    expect(
      view.printers.flatMap((printer) =>
        printer.targets.map((target) => `${printer.id}/${target.label}`),
      ),
    ).to.deep.equal(["a/Scan", "b/Scan"]);
  });

  it("rejects an unknown target label", () => {
    expect(() =>
      buildResolveView(resolveConfig({ targets: { A: {} } }), {
        target: "Nope",
      }),
    ).to.throw(/unknown target "Nope".*A/);
  });

  it("rejects an unknown printer id", () => {
    expect(() =>
      buildResolveView(resolveConfig({}), { printer: "nope" }),
    ).to.throw(/unknown printer "nope"/);
  });

  it("formats a parseable JSON document", () => {
    const view = buildResolveView(resolveConfig({ label: "Host" }));

    expect(() => {
      JSON.parse(formatResolveView(view));
    }).to.not.throw();
  });
});
