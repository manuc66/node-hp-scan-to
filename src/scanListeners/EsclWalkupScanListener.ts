import os from "node:os";
import DeviceClient from "../DeviceClient.js";
import type { EsclWalkupDevice } from "../type/WalkupDevice.js";
import type EsclWalkupEvent from "../hpModels/EsclWalkupEvent.js";
import { EsclWalkupEventType } from "../hpModels/EsclWalkupEvent.js";
import { ScanPlexMode } from "../hpModels/ScanPlexMode.js";
import { KnownShortcut } from "../type/KnownShortcut.js";
import type {
  RegistrationConfig,
  ScanTarget,
} from "../type/scanTargetDefinitions.js";
import {
  PermanentScanListenerError,
  type ScanListener,
  type ScanRequest,
} from "./ScanListener.js";
import { EsclWalkupProbe } from "../type/EsclWalkupProbe.js";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

const EVENT_TIMEOUT_SECONDS = 100;
const MAX_SHORTCUTS = 5;
const MAX_SUBSCRIPTION_ATTEMPTS = 2;
const DEFAULT_NEXT_PAGE_TIMEOUT_MS = 60_000;
/**
 * Consecutive 503s after which an HP subscription is considered wedged: its
 * `/Event` channel never recovers until the subscription is deleted and
 * created again. The count spans `listen` loop iterations, so the retry delay
 * (including `Retry-After`) is respected between polls.
 */
const MAX_CONSECUTIVE_EVENT_UNAVAILABLE = 3;
/** Re-registrations tolerated without a successful poll in between. */
const MAX_RECOVERY_CYCLES = 2;

/**
 * eSCL walkup implementation used by newer HP firmware:
 * `POST /eSCL/WalkupSubscriptions` then long-poll
 * `GET /eSCL/WalkupSubscriptions/{id}/Event`.
 *
 * Unlike the HP WalkupScan protocol, the event already carries the chosen shortcut,
 * so there is no destination resource to fetch and no separate "comp event"
 * channel to poll for the next page.
 */
export default class EsclWalkupScanListener implements ScanListener {
  private subscriptionURI: string | null = null;
  private consecutiveUnavailable = 0;
  private recoveryCycles = 0;
  private readonly scanTargets: ScanTarget[];

  constructor(
    private readonly api: EsclWalkupDevice,
    private readonly registrationConfigs: RegistrationConfig[],
    private readonly nextPageTimeoutMs = DEFAULT_NEXT_PAGE_TIMEOUT_MS,
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

    const subscriptionURI = await this.api.registerEsclWalkupSubscription(
      os.hostname(),
      shortcuts,
    );
    this.subscriptionURI = subscriptionURI;
    logger.info(`Registered eSCL walkup subscription: ${subscriptionURI}`);

    return subscriptionURI;
  }

  private invalidateSubscription(): void {
    this.subscriptionURI = null;
  }

  /**
   * Best effort: the subscription may already be gone (the printer rebooted
   * and now answers 403 on the stale id), and failing to delete it must not
   * prevent the re-registration that follows.
   */
  private async removeSubscriptionQuietly(
    subscriptionURI: string,
  ): Promise<void> {
    try {
      await this.api.removeEsclWalkupSubscription(subscriptionURI);
      logger.debug(
        `Removed the stale eSCL walkup subscription: ${subscriptionURI}`,
      );
    } catch (error) {
      logger.debug(
        `Could not remove the stale eSCL walkup subscription ${subscriptionURI}: ${String(error)}`,
      );
    }
  }

  private async nextEvent(
    timeoutSeconds = EVENT_TIMEOUT_SECONDS,
  ): Promise<EsclWalkupEvent | null> {
    for (let attempt = 0; attempt < MAX_SUBSCRIPTION_ATTEMPTS; attempt++) {
      const subscriptionURI = await this.getSubscriptionURI();
      try {
        const event = await this.api.getEsclWalkupEvent(
          subscriptionURI,
          timeoutSeconds,
        );
        // Any answer, including the 204 of an idle long poll, proves that the
        // subscription works again.
        this.consecutiveUnavailable = 0;
        this.recoveryCycles = 0;
        return event;
      } catch (error) {
        const unavailable = DeviceClient.isServiceUnavailable(error);
        if (unavailable) {
          this.consecutiveUnavailable++;
          if (this.consecutiveUnavailable < MAX_CONSECUTIVE_EVENT_UNAVAILABLE) {
            // Retryable: `listen` waits (honouring Retry-After) and polls again.
            throw error;
          }
        } else if (!DeviceClient.isSubscriptionExpired(error)) {
          throw error;
        }

        if (this.recoveryCycles >= MAX_RECOVERY_CYCLES) {
          throw new PermanentScanListenerError(
            unavailable
              ? "The printer keeps answering 503 on the eSCL walkup event channel after re-registering; giving up."
              : "The printer keeps rejecting the eSCL walkup subscription after re-registering; giving up.",
            { cause: error },
          );
        }

        if (attempt === MAX_SUBSCRIPTION_ATTEMPTS - 1) {
          throw new PermanentScanListenerError(
            "The printer keeps rejecting the eSCL walkup subscription after re-registering; giving up.",
            { cause: error },
          );
        }

        // A rejected subscription is either stale (the printer rebooted and
        // forgot it) or a sign that the device is not ready to talk walkup.
        // Only the former is worth a DELETE + POST: hammering a booting
        // printer with registrations does not help.
        const probe = await this.api.probeEsclWalkup();
        if (probe === EsclWalkupProbe.Missing) {
          throw new PermanentScanListenerError(
            "The printer no longer serves /eSCL/WalkupSubscriptions; eSCL scan-to-computer is unavailable on this device.",
            { cause: error },
          );
        }
        if (probe !== EsclWalkupProbe.Supported) {
          throw new Error(
            probe === EsclWalkupProbe.Refused
              ? "The printer is not ready for eSCL walkup yet; keeping the current subscription and retrying."
              : "Could not reach the printer to check the eSCL walkup subscription; keeping the current subscription and retrying.",
            { cause: error },
          );
        }

        this.recoveryCycles++;
        this.consecutiveUnavailable = 0;
        this.invalidateSubscription();
        await this.removeSubscriptionQuietly(subscriptionURI);
        logger.warn(
          unavailable
            ? "The eSCL walkup event channel answered 503 repeatedly; registering the subscription again."
            : "The eSCL walkup subscription was rejected; registering it again.",
        );
      }
    }

    // Unreachable: the loop either returns, throws, or exhausts its attempts.
    throw new Error("Could not register an eSCL walkup subscription.");
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
    const deadline = Date.now() + this.nextPageTimeoutMs;

    while (!sessionComplete && nextPage === null) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        logger.info(
          "No further scan page within the user action timeout; ending the session.",
        );
        return null;
      }

      const event = await this.nextEvent(
        Math.min(
          EVENT_TIMEOUT_SECONDS,
          Math.max(1, Math.ceil(remainingMs / 1000)),
        ),
      );
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
 * fixed KnownShortcut enum. Keep the PDF/JPEG decision explicit and predictable.
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
