import { describe } from "mocha";
import { expect } from "chai";
import path from "node:path";
import os from "node:os";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import {
  uploadImagesToNextcloud,
  uploadPdfToNextcloud,
  nextcloudWebdavFileUrl,
} from "../src/nextcloud/nextcloud.js";
import type { NextcloudConfig } from "../src/nextcloud/NextcloudConfig.js";
import { convertToPdf } from "../src/pdfProcessing.js";
import nock from "nock";
import fsPromises from "node:fs/promises";
import fs, { existsSync } from "node:fs";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("nextcloud", () => {
  describe("nextcloudWebdavFileUrl", () => {
    it("builds the WebDAV url of an uploaded file", () => {
      expect(
        nextcloudWebdavFileUrl(
          {
            baseUrl: nextcloudUrl,
            username,
            password,
            uploadFolder,
            keepFiles: false,
          },
          "scan.pdf",
        ),
      ).to.equal(
        `https://nextcloud.example.test/remote.php/dav/files/scanner/scan/scan.pdf`,
      );
    });
  });
  // prepare test data
  const fileName = "nextcloud_sample.jpg";
  const filePath = path.resolve(__dirname, `./asset/${fileName}`);
  const nextcloudUrl = "https://nextcloud.example.test";
  const username = "scanner";
  const password = "pa$$word";
  const uploadFolder = "scan";
  const scanDate = new Date(2026, 7, 28, 20, 13, 45);

  let scanJobContent: ScanContent;
  let scanPage: ScanPage;
  let nextcloudConfig: NextcloudConfig;

  beforeEach(async () => {
    nock.cleanAll();
    nock.disableNetConnect();

    if (!existsSync(path.dirname(filePath))) {
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    }
    if (!existsSync(filePath)) {
      await fsPromises.writeFile(filePath, "fake-jpg-content");
    }

    scanJobContent = { elements: [] };
    scanPage = {
      pageNumber: 1,
      path: filePath,
      width: 400,
      height: 300,
      xResolution: 96,
      yResolution: 96,
    };

    nextcloudConfig = {
      baseUrl: nextcloudUrl,
      username: username,
      password: password,
      uploadFolder: uploadFolder,
      keepFiles: false,
    };
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("upload images to Nextcloud", () => {
    it("success upload single image", async () => {
      nock(nextcloudUrl)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}`,
          "PROPFIND",
        )
        .basicAuth({ user: username, pass: password })
        .reply(
          207,
          '<?xml version="1.0"?>\n' +
            '<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:response><d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
        )
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}/${fileName}`,
          "PUT",
        )
        .basicAuth({ user: username, pass: password })
        .reply(201);

      scanJobContent.elements.push(scanPage);

      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
    });

    it("success upload multiple images", async () => {
      const fileName1 = "sample1.jpg";
      const fileName2 = "sample2.jpg";
      const filePath1 = path.resolve(__dirname, `./asset/${fileName1}`);
      const filePath2 = path.resolve(__dirname, `./asset/${fileName2}`);

      nock(nextcloudUrl)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}`,
          "PROPFIND",
        )
        .basicAuth({ user: username, pass: password })
        .reply(
          207,
          '<?xml version="1.0"?>\n' +
            '<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:response><d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
        )
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}/${fileName}`,
          "PUT",
        )
        .basicAuth({ user: username, pass: password })
        .reply(201)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}/${fileName1}`,
          "PUT",
        )
        .basicAuth({ user: username, pass: password })
        .reply(201)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}/${fileName2}`,
          "PUT",
        )
        .basicAuth({ user: username, pass: password })
        .reply(201);

      fs.copyFileSync(filePath, filePath1);
      fs.copyFileSync(filePath, filePath2);

      scanJobContent.elements.push(scanPage);

      const scanPage2 = { ...scanPage };
      scanPage2.pageNumber = 2;
      scanPage2.path = filePath1;
      scanJobContent.elements.push(scanPage2);

      const scanPage3 = { ...scanPage };
      scanPage3.pageNumber = 3;
      scanPage3.path = filePath2;
      scanJobContent.elements.push(scanPage3);

      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
    });

    it("user not authorized", async () => {
      nock(nextcloudUrl)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}`,
          "PROPFIND",
        )
        .basicAuth({ user: username, pass: password })
        .reply(401, "Unauthorized");
      scanJobContent = { elements: [] };

      let threw = false;
      try {
        await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
      } catch {
        threw = true;
      }
      if (!threw) {
        throw new Error("Should have thrown");
      }
    });

    it("upload path does not exist", async () => {
      nock(nextcloudUrl)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}`,
          "PROPFIND",
        )
        .basicAuth({ user: username, pass: password })
        .reply(404, "No such file or directory");
      scanJobContent = { elements: [] };

      let threw = false;
      try {
        await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
      } catch {
        threw = true;
      }
      if (!threw) {
        throw new Error("Should have thrown");
      }
    });

    it("upload file failed", async () => {
      nock(nextcloudUrl)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}`,
          "PROPFIND",
        )
        .basicAuth({ user: username, pass: password })
        .reply(
          207,
          '<?xml version="1.0"?>\n' +
            '<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:response><d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
        )
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}/${fileName}`,
          "PUT",
        )
        .basicAuth({ user: username, pass: password })
        .reply(404);

      scanJobContent.elements.push(scanPage);

      let threw = false;
      try {
        await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
      } catch {
        threw = true;
      }
      if (!threw) {
        throw new Error("Should have thrown");
      }
    });

    it("upload file not found", async () => {
      const unknownFilePath = path.resolve(__dirname, "./asset/unknown.jpg");
      nock(nextcloudUrl)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}`,
          "PROPFIND",
        )
        .basicAuth({ user: username, pass: password })
        .reply(
          207,
          '<?xml version="1.0"?>\n' +
            '<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:response><d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
        )
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}/${fileName}`,
          "PUT",
        )
        .basicAuth({ user: username, pass: password })
        .reply(201);

      const scanPage = {
        pageNumber: 1,
        path: unknownFilePath,
        width: 400,
        height: 300,
        xResolution: 96,
        yResolution: 96,
      };
      scanJobContent.elements.push(scanPage);

      let threw = false;
      try {
        await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
      } catch {
        threw = true;
      }
      if (!threw) {
        throw new Error("Should have thrown");
      }
    });
  });

  describe("uploadPdfToNextcloud", () => {
    it("success upload pdf document", async () => {
      // Generate the PDF in a temp dir instead of test/asset: convertToPdf
      // writes next to the source page, and jspdf embeds a timestamp, so
      // writing into the tracked asset dir would dirty it on every run.
      const tempDir = await fsPromises.mkdtemp(
        path.join(os.tmpdir(), "nextcloud-pdf-"),
      );
      const tempJpg = path.join(tempDir, "nextcloud_sample.jpg");
      await fsPromises.copyFile(filePath, tempJpg);
      const pdfFilePath = await convertToPdf(
        { ...scanPage, path: tempJpg },
        false,
        scanDate,
      );
      const pdfFileName = path.basename(pdfFilePath ?? "");

      nock(nextcloudUrl)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}`,
          "PROPFIND",
        )
        .basicAuth({ user: username, pass: password })
        .reply(
          207,
          '<?xml version="1.0"?>\n' +
            '<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:response><d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
        )
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}/${pdfFileName}`,
          "PUT",
        )
        .basicAuth({ user: username, pass: password })
        .reply(201);

      await uploadPdfToNextcloud(pdfFilePath, nextcloudConfig);
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    });

    it("pdf document not set", async () => {
      nock(nextcloudUrl)
        .intercept(
          `/remote.php/dav/files/${username}/${uploadFolder}`,
          "PROPFIND",
        )
        .basicAuth({ user: username, pass: password })
        .reply(
          207,
          '<?xml version="1.0"?>\n' +
            '<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:response><d:propstat><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
        );

      await uploadPdfToNextcloud(null, nextcloudConfig);
    });
  });
});
