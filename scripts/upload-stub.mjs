#!/usr/bin/env node
// Minimal stub for paperless (multipart POST) and Nextcloud WebDAV
// (PROPFIND + PUT) so upload/credential flows can be tested without real
// services. Exit-free long-running server.
//
// Usage:
//   node scripts/upload-stub.mjs            # port 3998, success
//   STUB_FAIL=1 node scripts/upload-stub.mjs  # all endpoints fail
//
// Paperless: POST  /api/documents/post_document/
// Nextcloud: PROPFIND /remote.php/dav/files/<user>/<folder>
//            PUT    /remote.php/dav/files/<user>/<folder>/<file>

import http from "node:http";

const PORT = Number(process.env.STUB_PORT || 3998);
const FAIL = process.env.STUB_FAIL === "1";

const server = http.createServer((req, res) => {
  const auth = req.headers["authorization"] || "(no auth header)";
  req.resume();
  req.on("end", () => {
    if (
      req.method === "POST" &&
      req.url.startsWith("/api/documents/post_document/")
    ) {
      console.log(`[paperless] POST ${req.url} auth=${auth} FAIL=${FAIL}`);
      res.statusCode = FAIL ? 500 : 200;
      res.end(FAIL ? "Internal Server Error" : "OK");
      return;
    }
    if (req.method === "PROPFIND") {
      console.log(`[webdav] PROPFIND ${req.url} auth=${auth} FAIL=${FAIL}`);
      res.statusCode = FAIL ? 404 : 207;
      res.setHeader("Content-Type", "application/xml");
      res.end(
        FAIL
          ? ""
          : '<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:"></d:multistatus>',
      );
      return;
    }
    if (req.method === "PUT") {
      console.log(`[webdav] PUT ${req.url} auth=${auth} FAIL=${FAIL}`);
      res.statusCode = FAIL ? 500 : 201;
      res.end(FAIL ? "fail" : "");
      return;
    }
    console.log(`[other] ${req.method} ${req.url}`);
    res.statusCode = 404;
    res.end();
  });
});

server.listen(PORT, () =>
  console.log(`upload stub listening on ${PORT} (FAIL=${FAIL})`),
);
