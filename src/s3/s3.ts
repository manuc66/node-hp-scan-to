import axios from "axios";
import { createHash, createHmac } from "node:crypto";
import type { ScanContent } from "../type/ScanContent.js";
import type { S3Config } from "./S3Config.js";
import fs from "node:fs/promises";
import path from "node:path";
import { getLoggerForFile } from "../logger.js";

const logger = getLoggerForFile(import.meta.url);

export async function uploadImagesToS3(
  scanJobContent: ScanContent,
  s3Config: S3Config,
): Promise<void> {
  for (const element of scanJobContent.elements) {
    await uploadToS3(element.path, s3Config);
  }
}

export async function uploadPdfToS3(
  pdfFilePath: string | null,
  s3Config: S3Config,
): Promise<void> {
  if (pdfFilePath !== null) {
    await uploadToS3(pdfFilePath, s3Config);
  } else {
    logger.error(
      "Pdf generation has failed, nothing is going to be uploaded to S3",
    );
  }
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

function awsDateParts(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString();
  const amzDate = iso.replace(/-|:|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * URI-encode each path segment (RFC 3986 register-safe subset): only
 * unreserved characters ([A-Za-z0-9-._~]) and the '/' separator are kept,
 * everything else (UTF-8) is percent-encoded.
 */
function encodePath(pathKey: string): string {
  const bytes = Buffer.from(pathKey, "utf8");
  let out = "";
  for (const b of bytes) {
    const isUnreserved =
      b === 0x2f ||
      (b >= 0x41 && b <= 0x5a) ||
      (b >= 0x61 && b <= 0x7a) ||
      (b >= 0x30 && b <= 0x39) ||
      b === 0x2d ||
      b === 0x5f ||
      b === 0x2e ||
      b === 0x7e;
    if (isUnreserved) {
      out += String.fromCharCode(b);
    } else {
      out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

export function s3ObjectLocation(
  s3Config: S3Config,
  fileName: string,
): { bucket: string; key: string } {
  return {
    bucket: s3Config.bucket,
    key: buildObjectKey(s3Config.prefix, fileName),
  };
}

function buildObjectKey(prefix: string | undefined, fileName: string): string {
  const cleanPrefix = (prefix ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return cleanPrefix === "" ? fileName : `${cleanPrefix}/${fileName}`;
}

function buildObjectUrl(s3Config: S3Config, encodedKey: string): URL {
  const base = new URL(s3Config.endpointUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  if (s3Config.forcePathStyle) {
    base.pathname = `${basePath}/${s3Config.bucket}/${encodedKey}`;
  } else {
    base.hostname = `${s3Config.bucket}.${base.hostname}`;
    base.pathname = `${basePath}/${encodedKey}`;
  }
  return base;
}

function effectiveSessionToken(s3Config: S3Config): string | undefined {
  const token = s3Config.sessionToken;
  return token !== undefined && token.trim() !== "" ? token : undefined;
}

function signV4Put(
  url: URL,
  body: Buffer,
  s3Config: S3Config,
): { authorization: string; amzDate: string; payloadHash: string } {
  const payloadHash = sha256Hex(body);
  const { amzDate, dateStamp } = awsDateParts(new Date());

  const canonicalHeadersParts = [
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  const signedHeadersParts = ["host", "x-amz-content-sha256", "x-amz-date"];
  const sessionToken = effectiveSessionToken(s3Config);
  if (sessionToken !== undefined) {
    canonicalHeadersParts.push(`x-amz-security-token:${sessionToken}`);
    signedHeadersParts.push("x-amz-security-token");
  }
  const canonicalHeaders = `${canonicalHeadersParts.join("\n")}\n`;
  const signedHeaders = signedHeadersParts.join(";");

  const canonicalRequest = [
    "PUT",
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${s3Config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  let signingKey: Buffer = createHmac("sha256", `AWS4${s3Config.secretAccessKey}`)
    .update(dateStamp)
    .digest();
  signingKey = hmac(signingKey, s3Config.region);
  signingKey = hmac(signingKey, "s3");
  signingKey = hmac(signingKey, "aws4_request");

  const signature = hmacHex(signingKey, stringToSign);
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${s3Config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    amzDate,
    payloadHash,
  };
}

function contentTypeForExtension(ext: string): string {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "bmp":
      return "image/bmp";
    case "tiff":
    case "tif":
      return "image/tiff";
    case "pdf":
      return "application/pdf";
    case "ppm":
      return "image/x-portable-pixmap";
    case "pbm":
      return "image/x-portable-bitmap";
    case "pgm":
      return "image/x-portable-graymap";
    default:
      return "application/octet-stream";
  }
}

async function uploadToS3(filePath: string, s3Config: S3Config): Promise<void> {
  const fileName = path.basename(filePath);
  const key = buildObjectKey(s3Config.prefix, fileName);
  const encodedKey = encodePath(key);
  const url = buildObjectUrl(s3Config, encodedKey);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch (e) {
    logger.error(e, "Fail to read file");
    throw e;
  }

  const { authorization, amzDate, payloadHash } = signV4Put(
    url,
    fileBuffer,
    s3Config,
  );

  logger.info(`Start uploading to S3: ${key}`);
  try {
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      authorization,
      "content-type": contentTypeForExtension(
        path.extname(fileName).replace(/^\./, "").toLowerCase(),
      ),
    };
    const sessionToken = effectiveSessionToken(s3Config);
    if (sessionToken !== undefined) {
      headers["x-amz-security-token"] = sessionToken;
    }

    await axios({
      method: "PUT",
      url: url.toString(),
      headers,
      data: fileBuffer,
    });
    logger.info(
      `Document successfully uploaded to S3. (Bucket: ${s3Config.bucket}, Key: ${key})`,
    );
  } catch (error) {
    logger.error(error, "Fail to upload document to S3");
    throw error;
  }
}