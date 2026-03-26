import { expect } from "chai";
import { configSchema } from "../src/type/FileConfig.js";
import { ScanFormat } from "../src/type/scanFormat.js";

describe("FileConfig Format Normalization", () => {
  it("should normalize 'jpeg' to 'Jpeg'", () => {
    const result = configSchema.parse({ image_format: "jpeg" });
    expect(result.image_format).to.equal(ScanFormat.Jpeg);
  });

  it("should normalize 'JPEG' to 'Jpeg'", () => {
    const result = configSchema.parse({ image_format: "JPEG" });
    expect(result.image_format).to.equal(ScanFormat.Jpeg);
  });

  it("should fail on 'jpg'", () => {
    expect(() => configSchema.parse({ image_format: "jpg" })).to.throw();
  });

  it("should fail on 'JPG'", () => {
    expect(() => configSchema.parse({ image_format: "JPG" })).to.throw();
  });

  it("should normalize 'bmp' to 'Bmp'", () => {
    const result = configSchema.parse({ image_format: "bmp" });
    expect(result.image_format).to.equal(ScanFormat.Bmp);
  });

  it("should normalize 'BMP' to 'Bmp'", () => {
    const result = configSchema.parse({ image_format: "BMP" });
    expect(result.image_format).to.equal(ScanFormat.Bmp);
  });

  it("should fail on invalid format", () => {
    expect(() => configSchema.parse({ image_format: "png" })).to.throw();
  });

  it("should fail on 'jpg' in the 'format' field", () => {
    expect(() => configSchema.parse({ format: "jpg" })).to.throw();
  });
});
