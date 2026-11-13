import type { EtagEventTable } from "../hpModels/EventTable.js";
import type { EventType } from "../hpModels/WalkupScanToCompEvent.js";
import type EsclWalkupEvent from "../hpModels/EsclWalkupEvent.js";
import type Destination from "../hpModels/Destination.js";
import type { ScanPlexMode } from "../hpModels/ScanPlexMode.js";
import type { KnownShortcut } from "./KnownShortcut.js";
import type { EsclWalkupProbeResult } from "./EsclWalkupProbe.js";

/**
 * The shape of a walkup destination that `listen` consumes. Declared
 * structurally instead of using the concrete XML model classes, so listeners
 * (and their tests) only depend on what they actually read.
 */
export interface WalkupDestinationInfo {
  readonly name: string;
  readonly resourceURI: string;
  readonly shortcut: KnownShortcut | null;
  readonly scanPlexMode: ScanPlexMode | null;
}

export interface WalkupDestinationsInfo {
  readonly destinations: readonly WalkupDestinationInfo[];
}

/** Subset of DeviceClient used by the HP WalkupScan protocols. */
export interface HpWalkupDevice {
  getEvents(etag?: string, timeout?: number): Promise<EtagEventTable>;
  getWalkupScanDestinations(): Promise<WalkupDestinationsInfo>;
  getWalkupScanToCompDestinations(): Promise<WalkupDestinationsInfo>;
  getWalkupScanToCompEvent(
    compEventURI: string,
  ): Promise<{ eventType: EventType }>;
  getDestination(destinationURI: string): Promise<{
    shortcut: KnownShortcut | null;
    scanPlexMode: ScanPlexMode | null;
  }>;
  registerWalkupScanDestination(destination: Destination): Promise<string>;
  registerWalkupScanToCompDestination(
    destination: Destination,
  ): Promise<string>;
}

/** Subset of DeviceClient used by the eSCL walkup subscription extension. */
export interface EsclWalkupDevice {
  registerEsclWalkupSubscription(
    hostIdentifier: string,
    shortcuts: string[],
  ): Promise<string>;
  getEsclWalkupEvent(
    subscriptionURI: string,
    timeoutSeconds?: number,
  ): Promise<EsclWalkupEvent | null>;
  probeEsclWalkup(): Promise<EsclWalkupProbeResult>;
  removeEsclWalkupSubscription(subscriptionURI: string): Promise<void>;
}
