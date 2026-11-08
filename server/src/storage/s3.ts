import {
  S3Client, CreateMultipartUploadCommand, UploadPartCommand,
  CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
  ListPartsCommand, HeadObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

const s3Config = {
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey },
};

// Internal client: server-side control-plane ops (create/complete/abort/list/head/download).
export const s3 = new S3Client({ endpoint: config.s3.endpoint, ...s3Config });
// Public client: ONLY used to sign presigned URLs — its endpoint host is what
// ends up in the URL the browser calls, so it must be publicly reachable.
const s3Public = new S3Client({ endpoint: config.s3.publicEndpoint, ...s3Config });

const { bucket } = config.s3;

export async function createMultipartUpload(key: string, contentType = 'application/octet-stream') {
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }));
  return { uploadId: res.UploadId! };
}

export async function presignPart(key: string, uploadId: string, partNumber: number, expiresIn = config.submissions.uploadUrlTtlSec) {
  return getSignedUrl(s3Public, new UploadPartCommand({
    Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber,
  }), { expiresIn });
}

export async function listParts(key: string, uploadId: string) {
  const res = await s3.send(new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
  return (res.Parts ?? []).map((p) => ({ partNumber: p.PartNumber!, size: p.Size ?? 0, etag: p.ETag! }));
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: bucket, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) },
  }));
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
}

export async function headObject(key: string) {
  const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return { size: res.ContentLength ?? 0, contentType: res.ContentType, etag: res.ETag };
}

/** Stream object to a local file — used by check workers only. */
export async function downloadToFile(key: string, destPath: string): Promise<number> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const { createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  if (!res.Body) throw new Error('Empty S3 body');
  await pipeline(res.Body as NodeJS.ReadableStream, createWriteStream(destPath));
  return res.ContentLength ?? 0;
}

export async function objectExists(key: string): Promise<boolean> {
  try { await headObject(key); return true; } catch { return false; }
}
