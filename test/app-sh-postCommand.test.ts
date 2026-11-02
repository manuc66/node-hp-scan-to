import { describe, it } from "mocha";
import { expect } from "chai";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appShPath = path.join(__dirname, "../root/app.sh");

/**
 * The container entry point maps environment variables to CLI flags. The
 * post-commands must be reachable there too, otherwise the feature cannot be
 * used from the Docker image at all.
 */
describe("app.sh - post-processing commands", () => {
  const appShContent = fs.readFileSync(appShPath, "utf-8");

  const commandVariables = [
    ["POST_COMMAND_PDF", "--post-command-pdf"],
    ["POST_COMMAND_IMAGE", "--post-command-image"],
  ] as const;

  for (const [variable, flag] of commandVariables) {
    describe(`the ${variable} environment variable`, () => {
      it("is only forwarded when it is set", () => {
        const guard = new RegExp(`if \\[ -n "\\$${variable}" \\]; then`, "m");
        expect(appShContent).to.match(guard);
      });

      it("is forwarded as a single argument", () => {
        // The command line is split — and its quotes removed — by the
        // application, never by this shell: here the value has to stay one
        // argv element, otherwise a command with arguments would break apart.
        expect(appShContent).to.include(`ARGS+=("${flag}" "$${variable}")`);
      });
    });
  }

  it("forwards the commands before CMDLINE so CMDLINE keeps the last word", () => {
    const commandIndex = appShContent.indexOf("POST_COMMAND_PDF");
    const cmdlineIndex = appShContent.indexOf('if [ -n "$CMDLINE" ]');

    expect(commandIndex).to.be.greaterThan(-1);
    expect(cmdlineIndex).to.be.greaterThan(-1);
    expect(commandIndex).to.be.lessThan(cmdlineIndex);
  });

  it("leaves POST_COMMAND_TIMEOUT to the application", () => {
    // The application reads that variable itself as the fallback default.
    // Mapping it to --post-command-timeout here would make the environment
    // beat the config file and invert the documented precedence.
    expect(appShContent).to.include("POST_COMMAND_TIMEOUT");
    expect(appShContent).to.not.include("--post-command-timeout");
  });
});

describe("app.sh - syntax", () => {
  it("is a valid shell script", function () {
    if (process.platform === "win32") {
      this.skip();
    }

    const result = spawnSync("bash", ["-n", appShPath], { encoding: "utf8" });

    expect(result.status, result.stderr).to.equal(0);
  });
});
