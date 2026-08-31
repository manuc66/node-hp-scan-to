import dateformat from "dateformat";
import sanitizeFilename from "sanitize-filename";

// Each platform has its own file name rules, and applying the Windows rules
// everywhere would break existing POSIX usages (a `:` in a name, e.g. from an
// `HH:MM:ss` pattern, is perfectly valid on ext4/APFS). So:
// - Windows: a name is invalid when `sanitize-filename` would change it. The
//   package applies a conservative Windows rule set (forbidden characters
//   `/\?<>\\:*|"`, control codes, reserved device names, trailing dots and
//   spaces, 255-byte cap), and its rules are OS-independent, which also keeps
//   the check testable on any host.
// - POSIX (Linux, macOS): only `/` and the NUL byte are forbidden.
const POSIX_INVALID_CHARACTERS = ["/", "\0"];

export function getFileNameValidationErrors(
  fileName: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform !== "win32") {
    const errors: string[] = [];
    for (const character of POSIX_INVALID_CHARACTERS) {
      if (fileName.includes(character)) {
        errors.push(
          character === "\0" ? "the NUL byte" : `the character "${character}"`,
        );
      }
    }
    return errors;
  }

  const sanitized = sanitizeFilename(fileName);
  if (sanitized === fileName) {
    return [];
  }
  return [
    sanitized === ""
      ? "the resulting name would be empty"
      : `the resulting name would be sanitized to "${sanitized}"`,
  ];
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
        `Remove those characters from the pattern (e.g. replace ":" with "-"). ` +
        `Bare letters are date tokens; wrap literal text in double quotes like "scan".`,
    );
  }
}