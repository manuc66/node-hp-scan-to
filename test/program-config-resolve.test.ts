import { describe, it } from "mocha";
import { expect } from "chai";
import { resolveConfig } from "../src/config/resolve.js";
import { setupProgram } from "../src/program.js";

async function captureResolveOutput(
  program: ReturnType<typeof setupProgram>,
  argv: string[],
): Promise<string> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;

  process.stdout.write = (
    chunk: string | Uint8Array,
    ..._rest: unknown[]
  ): boolean => {
    chunks.push(chunk.toString());
    return true;
  };

  try {
    await program.parseAsync(["node", "test", ...argv]);
  } finally {
    process.stdout.write = originalWrite;
  }

  return chunks.join("");
}

describe("config resolve command", () => {
  it("prints the effective configuration of the resolved target", async () => {
    const program = setupProgram(
      resolveConfig({
        label: "Host",
        resolution: 300,
        paperless_token: "super-secret",
      }),
    );

    const output = await captureResolveOutput(program, ["config", "resolve"]);
    const parsed = JSON.parse(output) as {
      printers: {
        id: string;
        targets: {
          label: string;
          config: Record<string, unknown>;
        }[];
      }[];
    };

    expect(parsed.printers[0].id).to.equal("default");
    expect(parsed.printers[0].targets[0].label).to.equal("Host");
    expect(parsed.printers[0].targets[0].config["resolution"]).to.equal(300);
    expect(parsed.printers[0].targets[0].config["paperless_token"]).to.equal(
      "***",
    );
  });

  it("filters the output with --printer and --target", async () => {
    const program = setupProgram(
      resolveConfig({
        printers: {
          officejet: { ip: "192.168.1.5", targets: { Scan: {}, Archive: {} } },
          deskjet: { ip: "192.168.1.6", targets: { Scan: {} } },
        },
      }),
    );

    const output = await captureResolveOutput(program, [
      "config",
      "resolve",
      "--printer",
      "officejet",
      "--target",
      "Archive",
    ]);
    const parsed = JSON.parse(output) as {
      printers: { id: string; targets: { label: string }[] }[];
    };

    expect(parsed.printers).to.have.length(1);
    expect(parsed.printers[0].id).to.equal("officejet");
    expect(
      parsed.printers[0].targets.map((target) => target.label),
    ).to.deep.equal(["Archive"]);
  });

  it("rejects an unknown target", async () => {
    const program = setupProgram(resolveConfig({ targets: { A: {} } }));

    let failure: unknown;
    try {
      await captureResolveOutput(program, [
        "config",
        "resolve",
        "--target",
        "Nope",
      ]);
    } catch (error) {
      failure = error;
    }

    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.match(/unknown target "Nope"/);
  });
});
