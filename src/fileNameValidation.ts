import dateformat from "dateformat";
import filenameReservedRegex, {
  windowsReservedNameRegex,
} from "filename-reserved-regex";

// POSIX file systems only forbid "/" and the NUL byte; Windows forbids a
// whole class of characters plus reserved device names. The Windows rules
// come from the `filename-reserved-regex` package (reserved characters incl.
// control bytes, trailing dot/space, and reserved device names), so they are
// not maintained by hand here.
const POSIX_INVALID_CHARACTERS = ["/", "\0"];

export function getFileNameValidationErrors(
  fileName: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const errors: string[] = [];
  if (platform !== "win32") {
    for (const character of POSIX_INVALID_CHARACTERS) {
      if (fileName.includes(character)) {
        errors.push(
          character === "\0" ? "the NUL byte" : `the character "${character}"`,
        );
      }
    }
    return errors;
  }

  const matches = fileName.match(filenameReservedRegex()) ?? [];
  for (const match of new Set(matches)) {
    if (match === "." && fileName.endsWith(".")) {
      errors.push("a trailing dot");
    } else if (match === " " && fileName.endsWith(" ")) {
      errors.push("a trailing space");
    } else {
      errors.push(match === "\0" ? "the NUL byte" : `the character "${match}"`);
    }
  }
  if (windowsReservedNameRegex().test(fileName)) {
    const baseName = fileName.split(".")[0].trim().toUpperCase();
    errors.push(`the reserved device name "${baseName}"`);
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
        `Remove those characters from the pattern (e.g. replace ":" with "-"). ` +
        `Bare letters are date tokens; wrap literal text in double quotes like "scan".`,
    );
  }
}