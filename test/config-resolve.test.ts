import { describe, it } from "mocha";
import { expect } from "chai";
import os from "node:os";
import { configSchema } from "../src/type/FileConfig.js";
import { DuplexAssemblyMode } from "../src/type/DuplexAssemblyMode.js";
import { ScanMode } from "../src/type/scanMode.js";
import { resolveConfig } from "../src/config/resolve.js";
import { GLOBAL_KEYS, PRINTER_KEYS, PROFILE_KEYS } from "../src/config/keys.js";

// A legacy flat configuration that exercises every key group (device, scan,
// output, integrations, post-processing, health check). The resolver must carry
// all of them into the effective profile without dropping or rewriting one:
// this is the contract that keeps the existing configuration files working.
const richLegacyConfig = {
  ip: "192.168.1.5",
  name: "Officejet 6500 E710n-z",
  label: "Officejet",
  deviceUpPollingInterval: 2000,
  debug: true,
  directory: "/var/lib/scans",
  tempDirectory: "/var/lib/tmp",
  pattern: "scan_yyyy-mm-dd_HHMMss",
  width: "max",
  height: "max",
  resolution: 300,
  mode: "gray",
  image_format: "jpeg",
  paper_size: "A4",
  paper_orientation: "landscape",
  prefer_escl: true,
  add_emulated_duplex: true,
  emulated_duplex_label: "Officejet duplex",
  emulated_duplex_assembly_mode: "page-wise",
  single_scan_duplex: true,
  single_scan_pdf: true,
  autoscan_duplex: false,
  autoscan_pdf: true,
  autoscan_pollingInterval: 500,
  autoscan_startScanDelay: 3000,
  paperless_post_document_url:
    "https://paperless.example.tld/api/documents/post_document/",
  paperless_token: "paperless-token",
  paperless_token_file: "/run/secrets/paperless",
  paperless_group_multi_page_scan_into_a_pdf: true,
  paperless_always_send_as_pdf_file: true,
  nextcloud_url: "https://cloud.example.tld",
  nextcloud_username: "user",
  nextcloud_password: "password",
  nextcloud_password_file: "/run/secrets/nextcloud",
  nextcloud_upload_folder: "scan",
  s3_url: "https://s3.example.tld",
  s3_region: "eu-west-1",
  s3_access_key_id: "AKIAEXAMPLE",
  s3_secret_access_key: "s3-secret",
  s3_secret_access_key_file: "/run/secrets/s3",
  s3_bucket: "scans",
  s3_prefix: "inbox",
  s3_force_path_style: true,
  s3_session_token: "session-token",
  webhook_url: "https://hooks.example.tld/scan",
  webhook_auth: "hmac",
  webhook_auth_header: "x-signature",
  webhook_secret: "webhook-secret",
  webhook_secret_file: "/run/secrets/webhook",
  webhook_token: "webhook-token",
  webhook_username: "webhook-user",
  webhook_password: "webhook-password",
  webhook_payload: "full",
  keep_files: false,
  post_command_pdf: 'gs "{input}" "{output}"',
  post_command_image: 'exiftool -overwrite_original "{input}"',
  post_command_timeout: 60000,
  enableHealthCheck: true,
  healthCheckPort: 3001,
};

describe("resolveConfig - legacy configuration compatibility", () => {
  it("resolves a legacy config to one implicit printer", () => {
    const resolved = resolveConfig(richLegacyConfig);

    expect(resolved.printers).to.have.length(1);
    expect(resolved.printers[0].id).to.equal("default");
    expect(resolved.warnings).to.deep.equal([]);
  });

  it("carries every legacy key into the effective profile unchanged", () => {
    const resolved = resolveConfig(richLegacyConfig);
    const expected = configSchema.parse(richLegacyConfig);

    for (const target of resolved.printers[0].targets) {
      expect(target.config).to.deep.equal(expected);
    }
  });

  it("keeps the label and emulated-duplex registration of the legacy listen command", () => {
    const targets = resolveConfig(richLegacyConfig).printers[0].targets;

    expect(targets).to.have.length(2);
    expect(targets[0].label).to.equal("Officejet");
    expect(targets[0].isDuplexSingleSide).to.equal(false);
    expect(targets[0].duplexAssemblyMode).to.equal(undefined);

    expect(targets[1].label).to.equal("Officejet duplex");
    expect(targets[1].isDuplexSingleSide).to.equal(true);
    expect(targets[1].duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.PAGE_WISE,
    );
  });

  it("defaults the implicit label to the host name and generates the duplex one", () => {
    const targets = resolveConfig({ add_emulated_duplex: true }).printers[0]
      .targets;

    expect(targets).to.have.length(2);
    expect(targets[0].label).to.equal(os.hostname());
    expect(targets[1].label).to.equal(`${os.hostname()} duplex`);
    expect(targets[1].duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.DOCUMENT_WISE,
    );
  });

  it("does not add a duplex registration when emulated duplex is disabled", () => {
    const resolved = resolveConfig({
      label: "Desk",
      add_emulated_duplex: false,
    });

    expect(resolved.printers[0].targets).to.have.length(1);
  });

  it("keeps the legacy validation error message", () => {
    expect(() => resolveConfig({ resolution: -1 })).to.throw(
      /Configuration validation error/,
    );
  });

  it("still applies the cross-field paper rules to the effective profile", () => {
    expect(() => resolveConfig({ paper_size: "A4", width: 100 })).to.throw(
      /width\/height with paper_size/,
    );
  });
});

describe("resolveConfig - targets of the implicit printer", () => {
  it("registers every label of a targets block with the shared settings", () => {
    const resolved = resolveConfig({
      directory: "/scans",
      resolution: 300,
      targets: {
        Paperless: {},
        "Archive locale": { duplex: "emulated", assembly_mode: "page-wise" },
      },
    });

    expect(resolved.printers).to.have.length(1);
    const targets = resolved.printers[0].targets;
    expect(targets.map((target) => target.label)).to.deep.equal([
      "Paperless",
      "Archive locale",
    ]);

    expect(targets[0].isDuplexSingleSide).to.equal(false);
    expect(targets[0].config.directory).to.equal("/scans");
    expect(targets[0].config.resolution).to.equal(300);

    expect(targets[1].isDuplexSingleSide).to.equal(true);
    expect(targets[1].duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.PAGE_WISE,
    );
    expect(targets[1].config).to.deep.equal(targets[0].config);
  });

  it("defaults the emulated duplex assembly mode to document-wise", () => {
    const targets = resolveConfig({ targets: { D: { duplex: "emulated" } } })
      .printers[0].targets;

    expect(targets[0].duplexAssemblyMode).to.equal(
      DuplexAssemblyMode.DOCUMENT_WISE,
    );
  });

  it("keeps the printer settings alongside targets", () => {
    const targets = resolveConfig({
      ip: "192.168.1.5",
      prefer_escl: true,
      targets: { X: {} },
    }).printers[0].targets;

    expect(targets[0].config.ip).to.equal("192.168.1.5");
    expect(targets[0].config.prefer_escl).to.equal(true);
  });

  it("rejects assembly_mode on a target that is not emulated duplex", () => {
    expect(() =>
      resolveConfig({ targets: { X: { assembly_mode: "page-wise" } } }),
    ).to.throw(/assembly_mode/);
  });

  it("rejects a targets block combined with the legacy label", () => {
    expect(() =>
      resolveConfig({ label: "Legacy", targets: { X: {} } }),
    ).to.throw(/label/);
  });

  const legacyDuplexKeys = {
    add_emulated_duplex: true,
    emulated_duplex_label: "Legacy duplex",
    emulated_duplex_assembly_mode: "page-wise",
  } as const;

  for (const [key, value] of Object.entries(legacyDuplexKeys)) {
    it(`rejects a targets block combined with ${key}`, () => {
      expect(() =>
        resolveConfig({ [key]: value, targets: { X: {} } }),
      ).to.throw(key);
    });
  }

  it("rejects an empty targets block", () => {
    expect(() => resolveConfig({ targets: {} })).to.throw(
      /at least one target/,
    );
  });

  it("rejects unknown keys inside a target", () => {
    expect(() => resolveConfig({ targets: { X: { foo: true } } })).to.throw(
      /unrecognized/i,
    );
  });
});

describe("resolveConfig - defaults", () => {
  it("applies defaults above the flat settings of the implicit profile", () => {
    const target = resolveConfig({
      resolution: 200,
      defaults: { resolution: 300, mode: "gray" },
    }).printers[0].targets[0];

    expect(target.config.resolution).to.equal(300);
    expect(target.config.mode).to.equal(ScanMode.Gray);
  });

  it("keeps the flat settings that defaults do not override", () => {
    const target = resolveConfig({
      directory: "/flat",
      defaults: { resolution: 300 },
    }).printers[0].targets[0];

    expect(target.config.directory).to.equal("/flat");
    expect(target.config.resolution).to.equal(300);
  });

  it("rejects printer keys inside defaults", () => {
    expect(() => resolveConfig({ defaults: { ip: "192.168.1.5" } })).to.throw(
      /unrecognized/i,
    );
  });

  it("rejects registration keys inside defaults", () => {
    expect(() =>
      resolveConfig({ defaults: { add_emulated_duplex: true } }),
    ).to.throw(/unrecognized/i);
  });
});

describe("resolveConfig - profiles", () => {
  it("resolves each target against its profile on top of defaults", () => {
    const resolved = resolveConfig({
      directory: "/flat",
      defaults: { resolution: 300 },
      profiles: {
        paperless: {
          mode: "gray",
          paperless_post_document_url:
            "https://paperless.example.tld/api/documents/post_document/",
          paperless_token: "token",
        },
        archive: { directory: "/archive", keep_files: true },
      },
      targets: {
        Paperless: { profile: "paperless" },
        Archive: { profile: "archive" },
        Legacy: {},
      },
    });

    const [paperless, archive, legacy] = resolved.printers[0].targets;

    expect(paperless.config.resolution).to.equal(300);
    expect(paperless.config.mode).to.equal(ScanMode.Gray);
    expect(paperless.config.paperless_token).to.equal("token");
    // Flat keys describe the implicit default profile only: a named profile
    // inherits `defaults`, not the historical file.
    expect(paperless.config.directory).to.equal(undefined);

    expect(archive.config.directory).to.equal("/archive");
    expect(archive.config.keep_files).to.equal(true);
    expect(archive.config.resolution).to.equal(300);

    expect(legacy.config.directory).to.equal("/flat");
    expect(legacy.config.resolution).to.equal(300);
  });

  it("accepts an explicit reference to the implicit default profile", () => {
    const target = resolveConfig({
      directory: "/flat",
      targets: { X: { profile: "default" } },
    }).printers[0].targets[0];

    expect(target.config.directory).to.equal("/flat");
  });

  it("shares one effective config between targets using the same profile", () => {
    const targets = resolveConfig({
      profiles: { a: { resolution: 300 } },
      targets: { X: { profile: "a" }, Y: { profile: "a" } },
    }).printers[0].targets;

    expect(targets[0].config).to.equal(targets[1].config);
  });

  it("rejects a target referencing an unknown profile", () => {
    expect(() =>
      resolveConfig({
        profiles: { a: {} },
        targets: { X: { profile: "b" } },
      }),
    ).to.throw(/unknown profile "b"/);
  });

  it("rejects the reserved default profile", () => {
    expect(() =>
      resolveConfig({
        profiles: { default: { resolution: 300 } },
        targets: { X: {} },
      }),
    ).to.throw(/reserved/);
  });

  it("requires targets to select a profile", () => {
    expect(() =>
      resolveConfig({ profiles: { a: { resolution: 300 } } }),
    ).to.throw(/targets/);
  });

  it("rejects printer keys inside a profile", () => {
    expect(() =>
      resolveConfig({
        profiles: { a: { ip: "192.168.1.5" } },
        targets: { X: { profile: "a" } },
      }),
    ).to.throw(/unrecognized/i);
  });
});

describe("resolveConfig - extends", () => {
  it("inherits a profile chain and lets the child override the parent", () => {
    const config = resolveConfig({
      defaults: { resolution: 150 },
      profiles: {
        base: { directory: "/base", mode: "color" },
        paperless: {
          extends: "base",
          mode: "gray",
          paperless_token: "token",
        },
      },
      targets: { P: { profile: "paperless" } },
    }).printers[0].targets[0].config;

    expect(config.directory).to.equal("/base");
    expect(config.mode).to.equal(ScanMode.Gray);
    expect(config.resolution).to.equal(150);
    expect(config.paperless_token).to.equal("token");
  });

  it("inherits the legacy flat settings through the default profile", () => {
    const config = resolveConfig({
      directory: "/flat",
      resolution: 200,
      profiles: { p: { extends: "default", resolution: 600 } },
      targets: { X: { profile: "p" } },
    }).printers[0].targets[0].config;

    expect(config.directory).to.equal("/flat");
    expect(config.resolution).to.equal(600);
  });

  it("rejects an unknown parent profile", () => {
    expect(() =>
      resolveConfig({
        profiles: { p: { extends: "nope" } },
        targets: { X: { profile: "p" } },
      }),
    ).to.throw(/unknown profile "nope"/);
  });

  it("rejects an extends cycle", () => {
    expect(() =>
      resolveConfig({
        profiles: { a: { extends: "b" }, b: { extends: "a" } },
        targets: { X: { profile: "a" } },
      }),
    ).to.throw(/circular|cycle/i);
  });

  it("rejects extends in defaults", () => {
    expect(() => resolveConfig({ defaults: { extends: "a" } })).to.throw(
      /unrecognized/i,
    );
  });
});

describe("resolveConfig - null unsets inherited keys", () => {
  it("removes an inherited key from a profile", () => {
    const config = resolveConfig({
      directory: "/flat",
      paperless_token: "token",
      profiles: {
        local: {
          extends: "default",
          paperless_token: null,
          directory: "/archive",
        },
      },
      targets: { L: { profile: "local" } },
    }).printers[0].targets[0].config;

    expect(config.paperless_token).to.equal(undefined);
    expect(config.directory).to.equal("/archive");
  });

  it("removes a defaults key for the default profile", () => {
    const config = resolveConfig({
      directory: "/flat",
      defaults: { directory: null },
    }).printers[0].targets[0].config;

    expect(config.directory).to.equal(undefined);
  });

  it("lets a child profile restore a key its parent unset", () => {
    const config = resolveConfig({
      paperless_token: "flat-token",
      profiles: {
        base: { extends: "default", paperless_token: null },
        pipeline: { extends: "base", paperless_token: "profile-token" },
      },
      targets: { X: { profile: "pipeline" } },
    }).printers[0].targets[0].config;

    expect(config.paperless_token).to.equal("profile-token");
  });
});

describe("resolveConfig - key ownership", () => {
  it("classifies every configuration key exactly once", () => {
    const schemaKeys = Object.keys(configSchema.shape).sort();
    const classified = [
      ...GLOBAL_KEYS,
      ...PRINTER_KEYS,
      ...PROFILE_KEYS,
    ].sort();

    expect(classified).to.deep.equal(schemaKeys);
  });
});
