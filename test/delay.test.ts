import { describe, it } from "mocha";
import { expect } from "chai";
import { delay } from "../src/delay.js";

describe("delay", () => {
  it("should delay execution", async () => {
    const start = Date.now();
    await delay(100);
    const end = Date.now();
    expect(end - start).to.be.at.least(90);
  });
});
