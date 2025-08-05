
import { describe } from "mocha";
import fs from "node:fs";
import path from "node:path";

import { setupProgram } from "../src/program";
import { Help } from "@commander-js/extra-typings";
import { expect } from "chai";

describe("README", () => {
  describe("command usage documentation", async () => {
    before(async () => {});

    it("have up-to-date listen usage", async () => {
      expectComandUsageIsUpdated("listen");
    });
    it("have up-to-date adf-autoscan usage", async () => {
      expectComandUsageIsUpdated("adf-autoscan");
    });
    it("have up-to-date single-scan usage", async () => {
      expectComandUsageIsUpdated("single-scan");
    });
    it("have up-to-date clear-registrations usage", async () => {
      expectComandUsageIsUpdated("clear-registrations");
    });
  });
});

function expectComandUsageIsUpdated(commandName: string) {
  const readmePath = path.join(__dirname, "..", "README.md");
  const usageInReadme = extractContentBetweenMarkers(readmePath, commandName);

  const program = setupProgram({});

  for (const command of program.commands) {
    if (command.name() === commandName) {
      const help = new Help();
      help.showGlobalOptions = true;
      const val = "```text\n" + help.formatHelp(command, help) + "```";
      expect(usageInReadme).to.be.eq(val);
    }
  }
}

function extractContentBetweenMarkers(
  filePath: string,
  command: string,
): string | null {
  try {
    // Read the file content
    const data = fs.readFileSync(filePath, "utf-8");

    // Define the markers
    const startMarker = `<!-- BEGIN HELP command: ${command} -->`;
    const endMarker = `<!-- END HELP command: ${command} -->`;

    // Find the start and end indices
    const startIndex = data.indexOf(startMarker);
    const endIndex = data.indexOf(endMarker);

    // Check if both markers are found
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      return null; // Return null if markers are not found or in the wrong order
    }

    // Extract the content between the markers
    const contentStart = startIndex + startMarker.length;
    return data.substring(contentStart, endIndex).trim(); // Return the extracted content
  } catch (error) {
    console.error("Error reading the file:", error);
    return null;
  }
}
