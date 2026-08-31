import dateformat from "dateformat";

const WINDOWS_INVALID_CHARACTERS = [`<`, `>`, `:`, `"`, `/`, `\\`, `|`, `?`, `*`];
const POSIX_INVALID_CHARACTERS = [`/`, "\0"];

const WINDOWS_RESERVED_BASE_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
  "CONIN$",
  "CONOUT$",
]);

interface FileNameRules {
  invalidCharacters: string[];
  reservedBaseNames?: ReadonlySet<string>;
  forbidTrailingDotOrSpace?: boolean;
}

/**
 * One file name is checked against the rules of the platform it will be
 * created on. Every platform has its own constraints:
 *
 * - Windows: `<>:"/\|?*` and control characters are forbidden, the name
 *   cannot end with a dot or a space, and reserved device names (CON, PRN,
 *   AUX, NUL, COM1-9, LPT1-9…) are not allowed.
 * - POSIX (Linux): only `/` and the NUL byte are forbidden.
 * - macOS: same as POSIX on the modern APFS volume (`:` was reserved on the
 *   legacy HFS+ filesystem but is allowed on current macOS installs).
 */
export function getFileNameRules(
  platform: NodeJS.Platform = process.platform,
): FileNameRules {
  switch (platform) {
    case "win32":
      return {
        invalidCharacters: WINDOWS_INVALID_CHARACTERS,
        reservedBaseNames: WINDOWS_RESERVED_BASE_NAMES,
        forbidTrailingDotOrSpace: true,
      };
    case "darwin":
    default:
      return { invalidCharacters: POSIX_INVALID_CHARACTERS };
  }
}

export function getFileNameValidationErrors(
  fileName: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const rules = getFileNameRules(platform);
  const errors: string[] = [];
  for (const character of rules.invalidCharacters) {
    if (fileName.includes(character)) {
      errors.push(
        character === "\0" ? "the NUL byte" : `the character "${character}"`,
      );
    }
  }
  if (rules.forbidTrailingDotOrSpace) {
    if (fileName.endsWith(".")) {
      errors.push("a trailing dot");
    }
    if (fileName.endsWith(" ")) {
      errors.push("a trailing space");
    }
  }
  if (rules.reservedBaseNames !== undefined) {
    const baseName = fileName.split(".")[0].toUpperCase();
    if (rules.reservedBaseNames.has(baseName)) {
      errors.push(`the reserved device name "${baseName}"`);
    }
  }
  return errors;
}

// A fixed date (02 January 2020, 03:04:05) makes the check deterministic:
// any literal character of the pattern is present in the rendered file name
// regardless of the actual scan date, and numeric tokens only ever expand to
// digits.
const DUMMY_DATE = new Date(2020, 0, 2, 3, 4, 5);

/**
 * Renders the file pattern the same way scans do and fails early when the
 * produced file name would be invalid on the given platform. This reports
 * invalid patterns at startup instead of crashing mid-scan.
 */
export function validateFilePatternForPlatform(
  filePattern: string,
  platform: NodeJS.Platform = process.platform,
): void {
  const renderedFileName = dateformat(DUMMY_DATE, filePattern);
  const errors = getFileNameValidationErrors(renderedFileName, platform);
  if (errors.length > 0) {
    throw new Error(
      `The file pattern "${filePattern}" would produce the file name "${renderedFileName}", which is not allowed on ${platform}: ${errors.join(", ")}. ` +
        `Remove those characters from the pattern (e.g. replace ":" with "-").`,
    );
  }
}