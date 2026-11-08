import type DeviceClient from "../DeviceClient.js";
import type Job from "../hpModels/Job.js";
import { JobState, PageState } from "../hpModels/Job.js";
import { delay } from "../delay.js";
import type { ScanPage } from "../type/ScanContent.js";
import { getLoggerForFile } from "../logger.js";
import { ScanJobHandler } from "./ScanJobHandler.js";

const logger = getLoggerForFile(import.meta.url);

async function waitDeviceUntilItIsReadyToUploadOrCompleted(
  api: DeviceClient,
  jobUrl: string,
): Promise<Job> {
  let job: null | Job;
  let isReadyToUpload;
  do {
    job = await api.getJob(jobUrl);
    if (job.jobState === JobState.Canceled) {
      return job;
    }
    isReadyToUpload =
      job.pageState === PageState.ReadyToUpload ||
      job.jobState === JobState.Completed;
    if (!isReadyToUpload) {
      await delay(300);
    }
  } while (!isReadyToUpload);
  return job;
}

/**
 * Scan job loop for the HP-proprietary LEDM job model: the device exposes a
 * job resource with a page state and per-page binary URLs.
 */
export class HpScanJobHandler extends ScanJobHandler {
  async handle(jobUrl: string): Promise<JobState> {
    const { api, scanJobContent } = this.context;

    let job = await api.getJob(jobUrl);
    while (job.jobState !== JobState.Completed) {
      job = await waitDeviceUntilItIsReadyToUploadOrCompleted(api, jobUrl);

      if (job.jobState === JobState.Completed) {
        continue;
      }

      if (job.jobState === JobState.Processing) {
        const pageNumber = this.nextPageNumber();
        const page = await this.handleScanProcessingState(job, pageNumber);
        job = await api.getJob(jobUrl);
        if (page !== null && job.jobState !== JobState.Canceled) {
          scanJobContent.elements.push(page);
        }
      } else if (job.jobState === JobState.Blocked) {
        logger.info("Job blocked, waiting for printer to complete");
        continue;
      } else {
        logger.info("Job cancelled by device");
        break;
      }
    }

    logger.info(
      `Job state: ${job.jobState} (${scanJobContent.elements.length} page(s))`,
    );
    return this.finish(job.jobState);
  }

  /**
   * Download the page advertised by the current job state, if any.
   * Exposed for the page-state unit tests.
   */
  async handleScanProcessingState(
    job: Job,
    pageNumber: number,
  ): Promise<ScanPage | null> {
    if (
      job.pageState !== PageState.ReadyToUpload ||
      job.binaryURL === null ||
      job.currentPageNumber === null
    ) {
      logger.warn(`Unknown pageState: ${job.pageState}`);
      await delay(200);
      return null;
    }

    const startedAt = Date.now();
    const destinationPath = await this.reserveDownloadPath(pageNumber);
    logger.info(
      `Downloading page ${job.currentPageNumber} → ${destinationPath}`,
    );

    try {
      const download = await this.context.api.downloadPageWithMeta(
        job.binaryURL,
        destinationPath,
      );
      const page = await this.savePage(download, pageNumber, startedAt, {
        width: job.imageWidth ?? 0,
        height: job.imageHeight ?? 0,
        xResolution: job.xResolution ?? 200,
        yResolution: job.yResolution ?? 200,
      });

      logger.info(`Page downloaded to: ${page.path}`);
      return page;
    } catch (error) {
      await this.releaseReservedFile(destinationPath);
      throw error;
    }
  }
}
