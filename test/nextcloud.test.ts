import { describe } from "mocha";
import path from "node:path";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import {
  uploadImagesToNextcloud,
  uploadPdfToNextcloud,
} from "../src/nextcloud/nextcloud.js";
import type { NextcloudConfig } from "../src/nextcloud/NextcloudConfig.js";
import { convertToPdf } from "../src/pdfProcessing.js";
import fs from "node:fs";
import nock from "nock";

const __dirname = import.meta.dirname;

describe("nextcloud", () => {
  // prepare test data
  const fileName = "sample.jpg";
  const filePath = path.resolve(__dirname, "./asset/" + fileName);
  const nextcloudUrl = "https://nextcloud.example.test";
  const username = "scanner";
  const password = "pa$$word";
  const uploadFolder = "scan";

  let scanJobContent: ScanContent;
  let scanPage: ScanPage;
  let nextcloudConfig: NextcloudConfig;

  beforeEach(async () => {
    nock.disableNetConnect();
    nock.enableNetConnect(nextcloudUrl);

    nock(nextcloudUrl, { allowUnmocked: true })
      .get(/.*/)
      .reply(503, "Service Unavailable");

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
      const filePath1 = path.resolve(__dirname, "./asset/" + fileName1);
      const filePath2 = path.resolve(__dirname, "./asset/" + fileName2);

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

      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
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

      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
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

      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
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

      await uploadImagesToNextcloud(scanJobContent, nextcloudConfig);
    });
  });

  describe("uploadPdfToNextcloud", () => {
    it("success upload pdf document", async () => {
      const pdfFilePath = await convertToPdf(scanPage, false);
      const pdfFileName = "sample.pdf";

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
