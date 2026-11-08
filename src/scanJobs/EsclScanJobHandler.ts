import type DeviceClient from "../DeviceClient.js";
import type EsclScanImageInfo from "../hpModels/EsclScanImageInfo.js";
import { type EsclJobInfo, eSCLJobState } from "../hpModels/EsclScanStatus.js";
import { JobState } from "../hpModels/Job.js";
import PathHelper from "../PathHelper.js";
import type { ScanPage } from "../type/ScanContent.js";
import { delay } from "../delay.js";
import { getLoggerForFile } from "../logger.js";
import { AxiosError } from "axios";
import { ScanJobHandler, type DownloadedPage } from "./ScanJobHandler.js";

const logger = getLoggerForFile(import.meta.url);

/**
 * Fetch the next page from an eSCL job. A 404 from /NextDocument is the
 * device's end-of-job signal: every image has been handed over and there is
 * nothing left to fetch (some firmwares keep reporting the job as
 * Processing/JobScanning while /NextDocument already answers 404). Returns
 * null in that case so the caller can end the loop gracefully; any other
 * failure is rethrown.
 */
async function downloadNextDocumentOrEnd(
  api: DeviceClient,
  jobUrl: string,
  destinationFilePath: string,
): Promise<DownloadedPage | null> {
  try {
    return await api.downloadEsclPage(jobUrl, destinationFilePath);
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      logger.info(
        "No further image available from /NextDocument (404); treating the job as completed.",
      );
      return null;
    }
    throw error;
  }
}

type EsclJobPollResult =
  | { readonly kind: "running"; readonly jobInfo: EsclJobInfo }
  | { readonly kind: "canceled" }
  | { readonly kind: "gone" };

/**
 * Read the device status for the job. The state is only used to stop on an
 * explicit cancellation: completion is driven by the /NextDocument 404, which
 * also covers firmwares that keep reporting Processing/JobScanning after the
 * last page.
 */
async function pollEsclJob(
  api: DeviceClient,
  jobUrl: string,
  jobLocation: string,
): Promise<EsclJobPollResult> {
  const scannerStatus = await api.getEsclScanStatus(jobUrl);
  const jobInfo = scannerStatus.findJobByUri(jobLocation);
  if (jobInfo === undefined) {
    return { kind: "gone" };
  }

  const jobState = jobInfo.getJobState();
  if (
    jobState === eSCLJobState.Canceled ||
    jobState === eSCLJobState.Aborted ||
    jobState === eSCLJobState.ProcessingStopped
  ) {
    logger.info(`Job ${jobState.toLowerCase()}; ending the scan.`);
    return { kind: "canceled" };
  }

  return { kind: "running", jobInfo };
}

function logJobInfo(
  jobUrl: string,
  scanImageInfo: EsclScanImageInfo,
  jobInfo: EsclJobInfo | undefined,
) {
  if (!jobUrl.includes(scanImageInfo.jobURI)) {
    logger.debug(
      `Incoherent state !!!! Job URI has changed: ${jobUrl} -> ${scanImageInfo.jobURI} -- crazy!`,
    );
  }

  logger.debug("From scanImageInfo:");
  logger.debug(`\tJob Uri: ${scanImageInfo.jobURI}`);
  logger.debug(`\tJob Uuid: ${scanImageInfo.jobUuid}`);

  logger.debug("From jobInfo:");
  logger.debug(`\tJob Uri: ${jobInfo?.getJobUri() ?? null}`);
  logger.debug(`\tJob Uuid: ${jobInfo?.getJobUuid() ?? null}`);
  logger.debug(`\tJob state: ${jobInfo?.getJobState() ?? null}`);
}

interface RetrievedPage {
  readonly page: ScanPage;
  readonly scanImageInfo: EsclScanImageInfo;
}

/**
 * Scan job loop for eSCL devices: the client pulls /NextDocument until the
 * device answers 404, and the job state is only used for cancellation.
 */
export class EsclScanJobHandler extends ScanJobHandler {
  async handle(jobUrl: string): Promise<JobState> {
    const jobLocation = PathHelper.getPathFromHttpLocation(jobUrl);

    while (true) {
      await delay(1000);

      const poll = await pollEsclJob(this.context.api, jobUrl, jobLocation);
      if (poll.kind === "gone") {
        logger.warn(
          "The device no longer reports this job in its scanner status; marking the scan as canceled.",
        );
        return this.finish(JobState.Canceled);
      }
      if (poll.kind === "canceled") {
        return this.finish(JobState.Canceled);
      }

      const retrieved = await this.retrieveNextPage(
        jobUrl,
        jobLocation,
        this.nextPageNumber(),
      );
      if (retrieved === null) {
        // Every image has been handed over: this is the end of the transfer.
        return this.finish(JobState.Completed);
      }

      this.context.scanJobContent.elements.push(retrieved.page);
      logJobInfo(jobUrl, retrieved.scanImageInfo, poll.jobInfo);
    }
  }

  private async retrieveNextPage(
    jobUrl: string,
    jobLocation: string,
    pageNumber: number,
  ): Promise<RetrievedPage | null> {
    const startedAt = Date.now();
    const destinationFilePath = await this.reserveDownloadPath(pageNumber);

    try {
      const download = await downloadNextDocumentOrEnd(
        this.context.api,
        jobUrl,
        destinationFilePath,
      );
      if (download === null) {
        // No page was written: release the name reservation.
        await this.releaseReservedFile(destinationFilePath);
        return null;
      }

      const scanImageInfo =
        await this.context.api.getEsclScanImageInfo(jobLocation);
      const page = await this.savePage(download, pageNumber, startedAt, {
        width: scanImageInfo.actualWidth,
        height: scanImageInfo.actualHeight,
        xResolution: this.context.scanJobSettings.xResolution,
        yResolution: this.context.scanJobSettings.yResolution,
      });

      logger.info(`Page downloaded to: ${page.path}`);
      return { page, scanImageInfo };
    } catch (error) {
      await this.releaseReservedFile(destinationFilePath);
      throw error;
    }
  }
}
