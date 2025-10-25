import { describe } from "mocha";
import { expect } from "chai";
import type { ScanContent, ScanPage } from "../src/type/ScanContent.js";
import { assembleDuplexScan } from "../src/commands/listenCmd.js";
import { DuplexAssemblyMode } from "../src/type/DuplexAssemblyMode.js";

// Utility function to create a ScanPage with default values
const createScanPage = (overrides: Partial<ScanPage>): ScanPage => {
  return {
    path: "default.png",
    pageNumber: 1,
    width: 100,
    height: 200,
    xResolution: 300,
    yResolution: 300,
    ...overrides,
  };
};

// Utility function to create ScanContent
const createScanContent = (pages: Partial<ScanPage>[]): ScanContent => {
  return { elements: pages.map(createScanPage) };
};

describe("assembleDuplexScan", () => {
  it("should assemble pages in natural order for PAGE_WISE mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should reverse backs for DOCUMENT_WISE mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.DOCUMENT_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should reverse fronts for REVERSE_FRONT mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.REVERSE_FRONT,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should reverse both fronts and backs for REVERSE_BOTH mode", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.REVERSE_BOTH,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should handle cases with missing back pages gracefully", () => {
    const frontScan = createScanContent([
      { path: "front1.png", pageNumber: 1 },
      { path: "front2.png", pageNumber: 2 },
    ]);
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 }, // Only one back page
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "front1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "front2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should handle cases with missing front pages gracefully", () => {
    const frontScan = createScanContent([]); // No front pages
    const backScan = createScanContent([
      { path: "back1.png", pageNumber: 1 },
      { path: "back2.png", pageNumber: 2 },
    ]);
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(result.elements).to.deep.equal([
      {
        path: "back1.png",
        pageNumber: 1,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
      {
        path: "back2.png",
        pageNumber: 2,
        width: 100,
        height: 200,
        xResolution: 300,
        yResolution: 300,
      },
    ]);
  });

  it("should return an empty array if both scans are empty", () => {
    const frontScan = createScanContent([]); // No front pages
    const backScan = createScanContent([]); // No back pages
    const result = assembleDuplexScan(
      frontScan,
      backScan,
      DuplexAssemblyMode.PAGE_WISE,
    );

    expect(result.elements).to.deep.equal([]);
  });
});
