import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { uploadImagesToS3 } from "../../src/s3/s3.js";
import { uploadImagesToNextcloud } from "../../src/nextcloud/nextcloud.js";
import { uploadImagesAsSeparateDocumentsToPaperless } from "../../src/paperless/paperless.js";
import type { ScanContent } from "../../src/type/ScanContent.js";

const target = process.argv[2];
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "upload-log-"));
const filePath = path.join(tempDir, "scan.jpg");
await fs.writeFile(filePath, "fake-jpg-content");

const scanJobContent: ScanContent = {
  elements: [
    {
      pageNumber: 1,
      path: filePath,
      width: 400,
      height: 300,
      xResolution: 96,
      yResolution: 96,
    },
  ],
};

try {
  if (target === "s3") {
    await uploadImagesToS3(scanJobContent, {
      endpointUrl: "http://127.0.0.1:1",
      region: "eu-west-1",
      bucket: "scans",
      accessKeyId: "AKIA_S3_DO_NOT_LOG",
      secretAccessKey: "s3-secret-access-key-DO-NOT-LOG",
      sessionToken: "s3-sts-token-DO-NOT-LOG",
      prefix: "inbox",
      forcePathStyle: true,
      keepFiles: true,
    });
  } else if (target === "nextcloud") {
    await uploadImagesToNextcloud(scanJobContent, {
      baseUrl: "http://127.0.0.1:1",
      username: "scanner",
      password: "nc-password-DO-NOT-LOG",
      uploadFolder: "scan",
      keepFiles: true,
    });
  } else if (target === "paperless") {
    await uploadImagesAsSeparateDocumentsToPaperless(scanJobContent, {
      postDocumentUrl: "http://127.0.0.1:1/api/documents/post_document/",
      authToken: "paperless-token-DO-NOT-LOG",
      keepFiles: true,
      groupMultiPageScanIntoAPdf: false,
      alwaysSendAsPdfFile: false,
    });
  } else {
    throw new Error(`Unknown target: ${target}`);
  }
} catch {
  // expected: the endpoint refuses the connection
}

await fs.rm(tempDir, { recursive: true, force: true });
await new Promise<void>((resolve) => setTimeout(resolve, 200));
