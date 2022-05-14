import { describe } from "mocha";
import { expect } from "chai";
import path from "path";
import * as fs from "fs/promises";
import HPApi from "../src/HPApi";
import WalkupScanToCompDestination from "../src/WalkupScanToCompDestination";
import WalkupScanDestination from "../src/WalkupScanDestination";
import Job from "../src/Job";

describe("Job", () => {
  describe("Parsing job_processing.xml", async () => {
    let job: Job;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/job_processing.xml"),
        { encoding: "utf8" }
      );
      job = await HPApi.createJob(content);
    });

    it("Parse jobState", async () => {
      expect(job.jobState).to.be.eq("Processing");
    });

    it("Parse xResolution", async () => {
      expect(job.xResolution).to.be.eq(200);
    });

    it("Parse yResolution", async () => {
      expect(job.yResolution).to.be.eq(200);
    });

    it("Parse imageHeight", async () => {
      expect(job.imageHeight).to.be.eq(2338);
    });

    it("Parse imageWidth", async () => {
      expect(job.imageWidth).to.be.eq(1654);
    });

    it("Parse currentPageNumber", async () => {
      expect(job.currentPageNumber).to.be.eq("1");
    });

    it("Parse binaryURL", async () => {
      expect(job.binaryURL).to.be.eq("/Scan/Jobs/2/Pages/1");
    });

    it("Parse pageState", async () => {
      expect(job.pageState).to.be.eq("PreparingScan");
    });

    it("Parse totalPageNumber", async () => {
      expect(job.totalPageNumber).to.be.eq(null);
    });
  });
  describe("Parsing job_completed.xml", async () => {
    let job: Job;

    before(async () => {
      const content: string = await fs.readFile(
        path.resolve(__dirname, "./asset/job_completed.xml"),
        { encoding: "utf8" }
      );
      job = await HPApi.createJob(content);
    });

    it("Parse jobState", async () => {
      expect(job.jobState).to.be.eq("Completed");
    });

    it("Parse xResolution", async () => {
      expect(job.xResolution).to.be.eq(null);
    });

    it("Parse yResolution", async () => {
      expect(job.yResolution).to.be.eq(null);
    });

    it("Parse imageHeight", async () => {
      expect(job.imageHeight).to.be.eq(null);
    });

    it("Parse imageWidth", async () => {
      expect(job.imageWidth).to.be.eq(null);
    });

    it("Parse currentPageNumber", async () => {
      expect(job.currentPageNumber).to.be.eq(null);
    });

    it("Parse binaryURL", async () => {
      expect(job.binaryURL).to.be.eq(null);
    });

    it("Parse pageState", async () => {
      expect(job.pageState).to.be.eq(null);
    });

    it("Parse totalPageNumber", async () => {
      expect(job.totalPageNumber).to.be.eq(1);
    });
  });
});
