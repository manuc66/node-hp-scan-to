import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

/**
 * Files created next to a scan while its post-processing hook ran.
 *
 * A hook may legitimately write additional files beside its input (an OCR
 * text, a signature, a sidecar manifest). Those files belong to the scan: the
 * delivery targets that take arbitrary files (S3 and Nextcloud) should receive
 * them next to the scan itself.
 *
 * Detection is a snapshot of the scan directories taken before and after the
 * pipeline, minus the files the scan is known to own. Nothing else runs
 * concurrently with a job (the processing queue is a strict FIFO), so the
 * difference is exactly what the hooks produced.
 */
export interface SidecarDetectionInput {
  /** Files present in the scan directories before the pipeline ran. */
  before: ReadonlySet<string>;
  /** Absolute paths of the files the scan itself owns (pages, PDF). */
  knownFiles: readonly string[];
  /** Directories that may hold the scan and its sidecars. */
  directories: readonly string[];
}

/**
 * Lists the regular files of the given directories, recursively.
 *
 * A missing directory yields an empty set so callers do not have to know
 * whether a folder exists yet.
 */
export async function snapshotDirectories(
  directories: readonly string[],
): Promise<Set<string>> {
  const snapshot = new Set<string>();
  const unique = [...new Set(directories)];

  for (const directory of unique) {
    await collectFiles(directory, snapshot);
  }

  return snapshot;
}

async function collectFiles(
  directory: string,
  into: Set<string>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    // A directory that does not exist (yet) simply holds no file.
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(entryPath, into);
    } else if (entry.isFile()) {
      into.add(entryPath);
    }
  }
}

/**
 * Lists the files the scan directories gained while the pipeline ran, minus
 * the files the scan owns. The result is sorted so logs and tests stay stable.
 */
export function collectSidecarFiles(
  input: SidecarDetectionInput,
  after: ReadonlySet<string>,
): string[] {
  const owned = new Set(input.knownFiles);

  const sidecars: string[] = [];
  for (const file of after) {
    if (input.before.has(file)) {
      continue;
    }
    if (owned.has(file)) {
      continue;
    }
    sidecars.push(file);
  }

  return sidecars.sort();
}

/**
 * Builds the set of directories to watch: those holding the pages of the
 * scan, plus the folders handed by the caller (the PDF destination, the
 * output folder).
 *
 * Restricting keeps the scan from claiming files a hook wrote elsewhere on
 * disk, and keeps unrelated files of a shared folder out of the upload.
 */
export function scanDirectories(
  scanJobContent: { elements: readonly { path: string }[] },
  extraDirectories: readonly (string | null | undefined)[] = [],
): string[] {
  const directories = new Set<string>();

  for (const element of scanJobContent.elements) {
    directories.add(path.dirname(element.path));
  }
  for (const extra of extraDirectories) {
    if (extra !== null && extra !== undefined && extra !== "") {
      directories.add(extra);
    }
  }

  return [...directories];
}
