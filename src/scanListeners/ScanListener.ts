import type { KnownShortcut } from "../type/KnownShortcut.js";
import type { ScanPlexMode } from "../hpModels/ScanPlexMode.js";
import type { ScanTarget } from "../type/scanTargetDefinitions.js";

/**
 * A normalised "the user asked this host to scan" event.
 *
 * Protocol-specific state (the legacy walkup event, the eSCL subscription
 * event, ...) is deliberately kept inside the listener implementation: the
 * caller only needs the target identity and the scan parameters.
 */
export interface ScanRequest extends ScanTarget {
  readonly shortcut: KnownShortcut | null;
  readonly scanPlexMode: ScanPlexMode | null;
  /** eSCL walkup subscription id, sent as ContextID when creating the job. */
  readonly contextID?: string;
}

/**
 * The part of the walkup protocol that `listen` needs, independently of the
 * transport used by the device (legacy WalkupScan or standard eSCL).
 *
 * Implementations are stateful: they keep whatever the device handed them
 * between `waitForScan`, `waitForScanStart` and `waitForNextPage`. A listener
 * therefore drives one scan session at a time, which matches the sequential
 * `listen` loop.
 */
export interface ScanListener {
  waitForScan(): Promise<ScanRequest | null>;
  waitForScanStart(): Promise<boolean>;
  waitForNextPage(): Promise<ScanRequest | null>;
  /** Release any registration made on the device. Optional for legacy listeners. */
  dispose?(): Promise<void>;
}
