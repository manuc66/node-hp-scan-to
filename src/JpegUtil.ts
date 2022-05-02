export default class JpegUtil {
  static GetJpgSize(buffer: Buffer): { height: number; width: number } | null {
    let i: number = 0;

    if (
      buffer[i] == 0xff &&
      buffer[i + 1] == 0xd8 &&
      buffer[i + 2] == 0xff &&
      buffer[i + 3] == 0xe0
    ) {
      i += 4;

      // Check for valid JPEG header (null terminated JFIF)
      if (
        buffer[i + 2] == "J".charCodeAt(0) &&
        buffer[i + 3] == "F".charCodeAt(0) &&
        buffer[i + 4] == "I".charCodeAt(0) &&
        buffer[i + 5] == "F".charCodeAt(0) &&
        buffer[i + 6] == 0x00
      ) {
        //Retrieve the block length of the first block since the first block will not contain the size of file
        let block_length = buffer[i] * 256 + buffer[i + 1];

        while (i < buffer.length) {
          //Increase the file index to get to the next block
          i += block_length;

          if (i >= buffer.length) {
            //Check to protect against segmentation faults
            return null;
          }

          if (buffer[i] != 0xff) {
            return null;
          }

          if (buffer[i + 1] == 0xc0) {
            //0xFFC0 is the "Start of frame" marker which contains the file size
            //The structure of the 0xFFC0 block is quite simple [0xFFC0][ushort length][uchar precision][ushort x][ushort y]
            const pHeight = buffer[i + 5] * 256 + buffer[i + 6];
            const pWidth = buffer[i + 7] * 256 + buffer[i + 8];

            console.log(pHeight);
            console.log(pWidth);

            return { height: pHeight, width: pWidth };
          } else {
            i += 2; //Skip the block marker

            //Go to the next block
            block_length = buffer[i] * 256 + buffer[i + 1];
          }
        }

        //If this point is reached then no size was found
        return null;
      } else {
        return null;
      } //Not a valid JFIF string
    } else {
      return null;
    } //Not a valid SOI header
  }
  static SetJpgSize(
    buffer: Buffer,
    size: { height: number; width: number }
  ): number {
    const FileSizeLow = buffer.length;
    let i: number = 0;

    if (
      buffer[i] == 0xff &&
      buffer[i + 1] == 0xd8 &&
      buffer[i + 2] == 0xff &&
      buffer[i + 3] == 0xe0
    ) {
      i += 4;

      // Check for valid JPEG header (null terminated JFIF)
      if (
        buffer[i + 2] == "J".charCodeAt(0) &&
        buffer[i + 3] == "F".charCodeAt(0) &&
        buffer[i + 4] == "I".charCodeAt(0) &&
        buffer[i + 5] == "F".charCodeAt(0) &&
        buffer[i + 6] == 0x00
      ) {
        //Retrieve the block length of the first block since the first block will not contain the size of file
        let block_length = buffer[i] * 256 + buffer[i + 1];

        while (i < FileSizeLow) {
          //Increase the file index to get to the next block
          i += block_length;

          if (i >= FileSizeLow) {
            //Check to protect against segmentation faults
            return -1;
          }

          if (buffer[i] != 0xff) {
            return -2;
          }

          if (buffer[i + 1] == 0xc0) {
            //0xFFC0 is the "Start of frame" marker which contains the file size
            //The structure of the 0xFFC0 block is quite simple [0xFFC0][ushort length][uchar precision][ushort x][ushort y]

            const height = Buffer.from([0x00, 0x00]);
            height.writeInt16BE(size.height);
            buffer[i + 5] = height[0];
            buffer[i + 6] = height[1];

            const width = Buffer.from([0x00, 0x00]);
            width.writeInt16BE(size.width);
            buffer[i + 7] = width[0];
            buffer[i + 8] = width[1];

            return 0;
          } else {
            i += 2; //Skip the block marker

            //Go to the next block
            block_length = buffer[i] * 256 + buffer[i + 1];
          }
        }

        //If this point is reached then no size was found
        return -3;
      } else {
        return -4;
      } //Not a valid JFIF string
    } else {
      return -5;
    } //Not a valid SOI header
  }
}