import { describe, it, afterEach, beforeEach } from "mocha";
import { expect } from "chai";
import { startHealthCheckServer } from "../src/healthcheck.js";
import http from "node:http";
import type { Server } from "node:net";
import nock from "nock";

describe("healthcheck", () => {
  let server: Server | undefined;
  const port = 3333;

  beforeEach(() => {
    nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);
  });

  afterEach(() => {
    nock.restore();
    nock.cleanAll();
    nock.enableNetConnect();
    if (server) {
      server.close();
      server = undefined;
    }
  });

  it("should return healthy on /health", (done) => {
    server = startHealthCheckServer(port);
    server.on("listening", () => {
      http
        .get(`http://localhost:${port}/health`, (res) => {
          expect(res.statusCode).to.equal(200);
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            expect(JSON.parse(data)).to.deep.equal({ status: "healthy" });
            done();
          });
        })
        .on("error", done);
    });
  });

  it("should return 404 on other paths", (done) => {
    server = startHealthCheckServer(port);
    server.on("listening", () => {
      http
        .get(`http://localhost:${port}/unknown`, (res) => {
          expect(res.statusCode).to.equal(404);
          done();
        })
        .on("error", (e) => {
          done(e);
        });
    });
  });
});
