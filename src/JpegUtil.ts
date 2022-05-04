let debug = false;

export default class JpegUtil {
  static setDebug(dbg: boolean) {
    debug = dbg;
  }

  private static logDebug(msg: any) {
    if (debug) {
      console.log(msg);
    }
  }

  private static numToHex(s: number) {
    let hex = s.toString(16);
    if (hex.length % 2 > 0) {
      hex = "0" + hex;
    }
    return hex.toUpperCase();
  }
  static GetJpgSize(buffer: Buffer): { height: number; width: number } | null {
    let size: { height: number; width: number } | null = null;
    this.parse(buffer, {
      FFC0: (start: number, length: number) => {
        // read the the "Start of frame" marker which contains the file size
        if (6 < length) {
          const pHeight = buffer[start + 3] * 256 + buffer[start + 4];
          const pWidth = buffer[start + 5] * 256 + buffer[start + 6];

          size = { height: pHeight, width: pWidth };
        }

        // stop processing
        return true;
      },
    });
    return size;
  }

  static setJpgSize(
    buffer: Buffer,
    size: { height: number; width: number }
  ): boolean {
    let sizeWritten = false;
    const parsingSucceed = this.parse(buffer, {
      FFC0: (start: number, length: number) => {
        // read the the "Start of frame" marker which contains the file size

        // write the picture size
        if (6 < length) {
          const height = Buffer.from([0x00, 0x00]);
          height.writeInt16BE(size.height);
          buffer[start + 3] = height[0];
          buffer[start + 4] = height[1];

          const width = Buffer.from([0x00, 0x00]);
          width.writeInt16BE(size.width);
          buffer[start + 5] = width[0];
          buffer[start + 6] = width[1];

          sizeWritten = true;
        }

        // stop processing
        return true;
      },
    });

    if (!parsingSucceed) {
      return false;
    }

    return sizeWritten;
  }

  static setJpgHeight(buffer: Buffer, height: number): boolean {
    let heightWritten = false;
    const parsingSucceed = this.parse(buffer, {
      FFC0: (start: number, length: number) => {
        // read the the "Start of frame" marker which contains the file size

        // write the picture size
        if (6 < length) {
          const heightBuffer = Buffer.from([0x00, 0x00]);
          heightBuffer.writeInt16BE(height);
          buffer[start + 3] = heightBuffer[0];
          buffer[start + 4] = heightBuffer[1];

          heightWritten = true;
        }

        // stop processing
        return true;
      },
    });

    if (!parsingSucceed) {
      return false;
    }

    return heightWritten;
  }

  static fixSizeWithDNL(buffer: Buffer): boolean {
    const numberOfLine = JpegUtil.readNumberOfLineFromDNL(buffer);

    if (numberOfLine == null) {
      return false;
    }

    return JpegUtil.setJpgHeight(buffer, numberOfLine);
  }

  static readNumberOfLineFromDNL(buffer: Buffer): number | null {
    let numberOfLine: number | null = null;
    this.parse(buffer, {
      FFDC: (start: number, length: number) => {
        // read the number of line
        if (3 < length) {
          numberOfLine = buffer[start + 2] * 256 + buffer[start + 3];
        }
        return true;
      },
    });
    return numberOfLine;
  }
  static parse(
    buffer: Buffer,
    markerHandler: { [key: string]: (start: number, length: number) => boolean }
  ): boolean {
    let i: number = 0;
    let marker = "";

    if (
      !(
        i + 3 < buffer.length &&
        buffer[i] == 0xff &&
        buffer[i + 1] == 0xd8 &&
        buffer[i + 2] == 0xff &&
        buffer[i + 3] == 0xe0
      )
    ) {
      this.logDebug("Not a valid SOI header");
      return false;
    }

    i += 4;

    // Check for valid JPEG header (null terminated JFIF)
    if (
      !(
        i + 6 < buffer.length &&
        buffer[i + 2] == "J".charCodeAt(0) &&
        buffer[i + 3] == "F".charCodeAt(0) &&
        buffer[i + 4] == "I".charCodeAt(0) &&
        buffer[i + 5] == "F".charCodeAt(0) &&
        buffer[i + 6] == 0x00
      )
    ) {
      this.logDebug("Not a valid JFIF string");
      return false;
    }

    //Retrieve the block length of the first block since the first block will not contain the size of file
    let blockLength = buffer[i] * 256 + buffer[i + 1];

    //Increase the file index to get to the next block
    i += blockLength;
    while (i < buffer.length) {
      if (buffer[i] != 0xff) {
        this.logDebug(
          "We should be at the begining of the next block, but got: " +
            buffer[i]
        );
        return false;
      }

      if (i + 1 >= buffer.length) {
        this.logDebug("End of stream prematurely found in marker: " + marker);
        return false;
      }

      if (buffer[i + 1] == 0x00) {
        this.logDebug(`Bad marker at ${i} 0x00 juste after marker ${marker}`);
        return false;
      }

      marker = this.numToHex(buffer[i]) + this.numToHex(buffer[i + 1]);

      const foundBlockLength = this.getBlockLength(buffer, i, marker);
      if (foundBlockLength == null) {
        this.logDebug(
          `Was not able to determine block size for marker ${marker}`
        );
        return false;
      }
      blockLength = foundBlockLength;

      const handler = markerHandler[marker];
      if (handler != null && handler(i + 2, blockLength)) {
        return true;
      }

      i = i + 2 + blockLength;
    }

    this.logDebug("End of payload reached");
    return true;
  }

  private static getBlockLength(
    buffer: Buffer,
    i: number,
    marker: string
  ): number | null {
    if (
      marker === "FFDA" ||
      marker === "FFD0" ||
      marker === "FFD1" ||
      marker === "FFD2" ||
      marker === "FFD3" ||
      marker === "FFD4" ||
      marker === "FFD5" ||
      marker === "FFD6" ||
      marker === "FFD7"
    ) {
      return JpegUtil.findCurrentBlockSize(
        buffer,
        i + 2,
        marker
      );
    } else {
      // read the new block length
      const blockLength = buffer[i + 2] * 256 + buffer[i + 3];

      this.logDebug(`block size for ${marker} is ${blockLength}`);
      return blockLength;
    }
  }

  private static findCurrentBlockSize(
    buffer: Buffer,
    i: number,
    current_marker: string
  ): number | null {
    for (let j = 0; i + j < buffer.length; j++) {
      if (buffer[i + j] === 0xff) {
        if (i + j + 1 < buffer.length) {
          if (buffer[i + j + 1] == 0x00) {
            // it's ok just continue
          } else {
            // we've just found the end of the Start of Scan
            return j;
          }
        } else {
          this.logDebug(
            `Premature end of stream reach while searching for the block size inside marker ${current_marker}`
          );
          return null;
        }
      }
    }
    return null;
  }
}
