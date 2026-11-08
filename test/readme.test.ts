import { describe, it } from "mocha";
import fs from "node:fs";
import path from "node:path";
import { setupProgram } from "../src/program.js";
import { Help } from "@commander-js/extra-typings";
import { expect } from "chai";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("README", () => {
  describe("command usage documentation", async () => {
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

  describe("table of contents", () => {
    it("is up to date with the headings", () => {
      const content = readReadme();
      expect(extractBetween(content, "<!-- TOC -->", "<!-- /TOC -->")).to.be.eq(
        buildTableOfContents(content),
      );
    });

    it("has no broken internal link", () => {
      const content = readReadme();
      const knownAnchors = new Set(parseHeadings(content).map((h) => h.slug));
      const anchors = [
        ...stripFencedCode(content).matchAll(anchorLinkPattern),
      ].map((match) => match[1]);
      const broken = [...new Set(anchors)].filter((a) => !knownAnchors.has(a));
      expect(broken, `unresolved anchors: ${broken.join(", ")}`).to.be.empty;
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
      const val = `\`\`\`text\n${help.formatHelp(command, help)}\`\`\``;
      // Normalize line endings: checkouts on Windows may convert the README
      // to CRLF, while the generated help always uses LF.
      expect(usageInReadme?.replace(/\r\n/g, "\n")).to.be.eq(val);
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

const anchorLinkPattern = /\]\(#([^)]+)\)/g;

interface Heading {
  level: number;
  title: string;
  slug: string;
}

function readReadme(): string {
  // Normalize line endings: checkouts on Windows may convert the README to
  // CRLF, while the generated table of contents always uses LF.
  return fs
    .readFileSync(path.join(__dirname, "..", "README.md"), "utf-8")
    .replace(/\r\n/g, "\n");
}

/**
 * GitHub's heading-anchor slug: lowercase, drop everything that is not a word
 * character, hyphen or space, then turn the spaces into hyphens.
 */
function toHeadingSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .replace(/ /g, "-");
}

/** Blank out fenced code blocks so their `#` comment lines are not headings. */
function stripFencedCode(content: string): string {
  let inFence = false;
  return content
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

function parseHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const occurrences = new Map<string, number>();
  for (const line of stripFencedCode(content).split("\n")) {
    const match = /^(#{1,6}) (.+?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const title = match[2];
    const base = toHeadingSlug(title);
    // GitHub and kramdown suffix repeated anchors with -1, -2, ...
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    headings.push({
      level: match[1].length,
      title,
      slug: occurrence === 0 ? base : `${base}-${occurrence}`,
    });
  }
  return headings;
}

/** The table of contents is generated from the H2-H5 headings of the README. */
function buildTableOfContents(content: string): string {
  return parseHeadings(content)
    .filter((heading) => heading.level >= 2 && heading.level <= 5)
    .map(
      (heading) =>
        `${"  ".repeat(heading.level - 2)}- [${heading.title}](#${heading.slug})`,
    )
    .join("\n");
}

function extractBetween(
  content: string,
  startMarker: string,
  endMarker: string,
): string {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    throw new Error(`markers not found or out of order: ${startMarker}`);
  }
  return content.slice(startIndex + startMarker.length, endIndex).trim();
}
