import type { KnownShortcut } from "../type/KnownShortcut.js";
import type { ScanPlexMode } from "../hpModels/ScanPlexMode.js";
import type { ScanTarget } from "../type/scanTargetDefinitions.js";

/**
 * A normalised "the user asked this host to scan" event.
 *
 * `continuation` is deliberately opaque: each protocol implementation stores
 * whatever it needs to wait for the next page or for the end of the session.
 */
export interface ScanRequest extends ScanTarget {
  readonly shortcut: KnownShortcut | null;
  readonly scanPlexMode: ScanPlexMode | null;
  readonly continuation: unknown;
  /** eSCL walkup subscription id, sent as ContextID when creating the job. */
  readonly contextID?: string;
}

/**
 * The part of the walkup protocol that `listen` needs, independently of the
 * transport used by the device (legacy WalkupScan or standard eSCL).
 */
export interface ScanListener {
  waitForScan(): Promise<ScanRequest | null>;
  waitForScanStart(request: ScanRequest): Promise<boolean>;
  waitForNextPage(request: ScanRequest): Promise<ScanRequest | null>;
  /** Release any registration made on the device. Optional for legacy listeners. */
  dispose?(): Promise<void>;
}
