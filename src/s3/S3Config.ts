export interface S3Config {
  /** S3-compatible endpoint (e.g. https://s3.us-east-1.amazonaws.com or a MinIO/R2 endpoint). */
  endpointUrl: string;
  /** AWS region the bucket lives in (used for request signing). */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** STS session token for temporary credentials (optional). */
  sessionToken?: string;
  /** "Folder" inside the bucket the scans are uploaded under (optional). */
  prefix?: string;
  /** Use path-style addressing (bucket in URL path), required for MinIO/R2/Wasabi. */
  forcePathStyle: boolean;
  keepFiles: boolean;
}