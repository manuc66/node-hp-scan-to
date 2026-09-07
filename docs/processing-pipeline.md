---
layout: default
---

# Processing pipeline

How captured scans move from the printer to their destination(s), and why the
capture loop stays responsive.

> **Short version:** capturing and delivering a scan are now decoupled.
> Capturing stays close to the printer; delivering happens on a background
> FIFO queue (and the PDF merge in a dedicated worker thread), so the loop
> keeps polling during slow uploads or heavy processing.

## Why

In `listen` and `adf-autoscan` mode the app used to wait for the whole
post-processing (PDF merge, uploads, webhook delivery, cleanup) before polling
the printer again. A large scan or a slow destination could make the loop miss
the next scan event or trip the printer's `userActionTimeout` /
`waitScanNewPageRequest` timeouts.

## What changed

- **Staged pipeline** (`src/postProcessing.ts`): `generate PDF → announce →
  deliver → webhook → log → cleanup`, threaded through a shared context.
  Future stages (e.g. an external OCR/deskew `--post-command`) plug in before
  the PDF merge.
- **FIFO processing queue** (`src/queue/processingQueue.ts`): each captured
  scan is enqueued and drained in order by a single background worker. Order
  is preserved; capture returns to the printer immediately.
- **CPU off the event loop** (`src/pdfMergeWorker.ts`): the jspdf merge runs
  in a worker thread, so health checks and printer HTTP responses stay
  responsive during a big merge.
- `single-scan` keeps its synchronous contract: it exits only once delivery
  completed (success or failure), so the exit code still reflects the upload
  outcome.
- `--keep-files` is decided at the end of each job, as before.

## Durability

Not in this version. The queue is in memory: if the process dies mid-job, the
captured files stay on disk (cleanup only runs once delivery finished) and the
delivery can be redone by hand. This is no worse than the previous synchronous
behavior.

Durability (surviving a crash, resuming pending jobs at startup) is planned as
a **conditional** feature: only relevant when a network delivery destination
is configured (Paperless, Nextcloud, S3, webhook). No new Docker volume or
constraint is required.

## Testing

`test/processingQueue.test.ts` covers the queue (enqueue returns before the
work completes, FIFO order, awaited single-job path). PDF merge and delivery
are covered by the existing suites; `scripts/live-test.sh` smoke-tests the
main flows against a real printer.

---

Back to [README](../) ·
[Source](https://github.com/manuc66/node-hp-scan-to/blob/master/src/queue/processingQueue.ts)