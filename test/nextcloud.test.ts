import { describe } from "mocha";
import path from "node:path";import {
  uploadPdfToNextcloud,
} from "../src/nextcloud/nextcloud.js";
import type { NextcloudConfig } from "../src/nextcloud/NextcloudConfig.js";
import nock from "nock";
import fsPromises from "node:fs/promises";
import { existsSync } from "node:fs";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("nextcloud", () => {
  // prepare test data
  const fileName = "nextcloud_sample.jpg";
  const filePath = path.resolve(__dirname, "./asset/" + fileName);
  const nextcloudUrl = "http://localhost";
  const username = "scanner";
  const password = "pa$$word";
  const uploadFolder = "scan";

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

  describe("uploadPdfToNextcloud", () => {
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
