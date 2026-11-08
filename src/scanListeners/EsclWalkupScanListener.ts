import os from "node:os";
import DeviceClient from "../DeviceClient.js";
import type EsclWalkupEvent from "../hpModels/EsclWalkupEvent.js";
import { EsclWalkupEventType } from "../hpModels/EsclWalkupEvent.js";
import { ScanPlexMode } from "../hpModels/ScanPlexMode.js";
import { KnownShortcut } from "../type/KnownShortcut.js";
import type {
  RegistrationConfig,
  ScanTarget,
} from "../type/scanTargetDefinitions.js";
import type { ScanListener, ScanRequest } from "./ScanListener.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

const EVENT_TIMEOUT_SECONDS = 100;
const MAX_SHORTCUTS = 5;

/**
 * eSCL walkup implementation used by newer HP firmware:
 * `POST /eSCL/WalkupSubscriptions` then long-poll
 * `GET /eSCL/WalkupSubscriptions/{id}/Event`.
 *
 * Unlike the legacy protocol, the event already carries the chosen shortcut,
 * so there is no destination resource to fetch and no separate "comp event"
 * channel to poll for the next page.
 */
export default class EsclWalkupScanListener implements ScanListener {
  private subscriptionURI: string | null = null;
  private readonly scanTargets: ScanTarget[];

  constructor(
    private readonly api: DeviceClient,
    private readonly registrationConfigs: RegistrationConfig[],
  ) {
    this.scanTargets = registrationConfigs.map((config) => ({
      ...config,
      // One subscription hosts several shortcuts; the shortcut label is the
      // stable identity `listen` uses to tell targets apart.
      resourceURI: `escl-walkup:${config.label}`,
    }));
  }

  private async getSubscriptionURI(): Promise<string> {
    if (this.subscriptionURI !== null) {
      return this.subscriptionURI;
    }

    const shortcuts = [
      ...new Set(this.registrationConfigs.map((config) => config.label)),
    ].slice(0, MAX_SHORTCUTS);
    if (shortcuts.length < this.registrationConfigs.length) {
      logger.warn(
        `The device supports at most ${MAX_SHORTCUTS} walkup shortcuts; only the first ones will be registered.`,
      );
    }

    this.subscriptionURI = await this.api.registerEsclWalkupSubscription(
      os.hostname(),
      shortcuts,
    );
    logger.info(`Registered eSCL walkup subscription: ${this.subscriptionURI}`);

    return this.subscriptionURI;
  }

  private invalidateSubscription(): void {
    this.subscriptionURI = null;
  }

  private async nextEvent(): Promise<EsclWalkupEvent | null> {
    const subscriptionURI = await this.getSubscriptionURI();
    try {
      return await this.api.getEsclWalkupEvent(
        subscriptionURI,
        EVENT_TIMEOUT_SECONDS,
      );
    } catch (error) {
      if (!DeviceClient.isSubscriptionExpired(error)) {
        throw error;
      }

      logger.warn(
        "The eSCL walkup subscription expired; registering it again.",
      );
      this.invalidateSubscription();
      // Recurse once per expired subscription, then poll the fresh one.
      return this.nextEvent();
    }
  }

  async waitForScan(): Promise<ScanRequest | null> {
    let request: ScanRequest | null = null;
    while (request === null) {
      const event = await this.nextEvent();
      if (event === null) {
        continue;
      }

      switch (event.eventType) {
        case EsclWalkupEventType.ScanRequested:
          request = this.toScanRequest(event);
          break;
        case EsclWalkupEventType.HostSelected:
          logger.info("Host selected on the printer panel.");
          break;
        case EsclWalkupEventType.ScanPagesComplete:
          logger.info("Previous scan session completed.");
          break;
        default:
          logger.warn(
            `Unknown eSCL walkup event: ${event.eventType as string}`,
          );
      }
    }

    return request;
  }

  waitForScanStart(): Promise<boolean> {
    // `ScanRequested` is already the user pressing Start on the printer.
    return Promise.resolve(true);
  }

  async waitForNextPage(): Promise<ScanRequest | null> {
    let nextPage: ScanRequest | null = null;
    let sessionComplete = false;

    while (!sessionComplete && nextPage === null) {
      const event = await this.nextEvent();
      if (event === null) {
        continue;
      }

      switch (event.eventType) {
        case EsclWalkupEventType.ScanRequested:
          nextPage = this.toScanRequest(event);
          break;
        case EsclWalkupEventType.HostSelected:
          // A new session started before the current one was explicitly
          // closed; let the outer loop handle it as a fresh scan.
          sessionComplete = true;
          break;
        case EsclWalkupEventType.ScanPagesComplete:
          sessionComplete = true;
          break;
        default:
          logger.warn(
            `Unknown eSCL walkup event: ${event.eventType as string}`,
          );
      }
    }

    return nextPage;
  }

  async dispose(): Promise<void> {
    const subscriptionURI = this.subscriptionURI;
    this.subscriptionURI = null;
    if (subscriptionURI === null) {
      return;
    }

    try {
      await this.api.removeEsclWalkupSubscription(subscriptionURI);
      logger.info(`Removed eSCL walkup subscription: ${subscriptionURI}`);
    } catch (error) {
      logger.warn(
        `Could not remove the eSCL walkup subscription ${subscriptionURI}: ${String(error)}`,
      );
    }
  }

  private toScanRequest(event: EsclWalkupEvent): ScanRequest {
    const target = this.findTarget(event.shortcut);
    const subscriptionURI = this.subscriptionURI ?? event.resourceURI ?? "";
    const contextID = subscriptionURI.split("/").filter(Boolean).pop();

    return {
      ...target,
      ...(contextID !== undefined && { contextID }),
      shortcut: mapShortcut(event.shortcut ?? target.label),
      scanPlexMode: event.scanPlexMode ?? ScanPlexMode.Simplex,
    };
  }

  private findTarget(shortcut: string | null): ScanTarget {
    if (shortcut !== null) {
      const exact = this.scanTargets.find(
        (target) => target.label === shortcut,
      );
      if (exact !== undefined) {
        return exact;
      }

      const caseInsensitive = this.scanTargets.find(
        (target) => target.label.toLowerCase() === shortcut.toLowerCase(),
      );
      if (caseInsensitive !== undefined) {
        return caseInsensitive;
      }

      logger.warn(
        `The printer reported an unknown shortcut "${shortcut}"; using "${this.scanTargets[0].label}".`,
      );
    }

    return this.scanTargets[0];
  }
}

/**
 * eSCL shortcuts are free-form labels chosen on the printer, unlike the
 * legacy enum. Keep the historical PDF/JPEG decision explicit and predictable.
 */
export function mapShortcut(shortcut: string): KnownShortcut {
  if (Object.values(KnownShortcut).includes(shortcut as KnownShortcut)) {
    return shortcut as KnownShortcut;
  }

  const lower = shortcut.toLowerCase();
  if (
    lower.includes("jpeg") ||
    lower.includes("jpg") ||
    lower.includes("photo")
  ) {
    return KnownShortcut.SaveJPEG;
  }

  return KnownShortcut.SavePDF;
}
