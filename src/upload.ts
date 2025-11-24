import * as core from '@actions/core';
import { S3Client, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

export interface UploadOptions {
  bucket: string;
  key: string;
  stream: Readable;
  contentLengthHint?: number; // Hint from HTTP header (may be 0 for chunked)
  contentType?: string;
  bucketOwner?: string;
  acl?: string;
  storageClass?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  etag: string;
  s3Url: string;
}

/**
 * Parse metadata from input string
 * Expects JSON object format
 */
export function parseMetadata(metadataInput?: string): Record<string, string> | undefined {
  if (!metadataInput || metadataInput.trim() === '') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(metadataInput.trim());
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      core.warning('Metadata must be a JSON object');
      return undefined;
    }
    return parsed;
  } catch (error) {
    core.warning(`Failed to parse metadata as JSON: ${error}`);
    return undefined;
  }
}

/**
 * Validate ACL value
 */
function validateAcl(acl?: string): string | undefined {
  if (!acl) return undefined;

  const validAcls = [
    'private',
    'public-read',
    'public-read-write',
    'authenticated-read',
    'aws-exec-read',
    'bucket-owner-read',
    'bucket-owner-full-control',
  ];

  if (!validAcls.includes(acl)) {
    throw new Error(
      `Invalid ACL value: ${acl}. Must be one of: ${validAcls.join(', ')}`
    );
  }

  return acl;
}

/**
 * Validate storage class
 */
function validateStorageClass(storageClass?: string): string | undefined {
  if (!storageClass) return undefined;

  const validClasses = [
    'STANDARD',
    'REDUCED_REDUNDANCY',
    'STANDARD_IA',
    'ONEZONE_IA',
    'INTELLIGENT_TIERING',
    'GLACIER',
    'DEEP_ARCHIVE',
    'GLACIER_IR',
  ];

  if (!validClasses.includes(storageClass)) {
    throw new Error(
      `Invalid storage class: ${storageClass}. Must be one of: ${validClasses.join(', ')}`
    );
  }

  return storageClass;
}

/**
 * Upload stream to S3
 * Streams data directly to S3 without storing locally
 */
export async function uploadStreamToS3(options: UploadOptions): Promise<UploadResult> {
  core.info(`Uploading to S3: s3://${options.bucket}/${options.key}`);

  // Validate inputs
  const acl = validateAcl(options.acl);
  const storageClass = validateStorageClass(options.storageClass);

  // Create S3 client (automatically uses credentials from environment)
  const s3Client = new S3Client({});

  // Log content length hint if known
  if (options.contentLengthHint && options.contentLengthHint > 0) {
    core.info(`Content-Length hint: ${options.contentLengthHint} bytes (${(options.contentLengthHint / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    core.info(`Content-Length: unknown (will be determined during upload)`);
  }

  // Prepare upload parameters
  const uploadParams: PutObjectCommandInput = {
    Bucket: options.bucket,
    Key: options.key,
    Body: options.stream,
    ContentType: options.contentType,
    // Only set ContentLength if we have a hint from the HTTP header
    // AWS SDK can handle uploads without ContentLength (uses chunked encoding)
    ContentLength: options.contentLengthHint && options.contentLengthHint > 0 ? options.contentLengthHint : undefined,
    ExpectedBucketOwner: options.bucketOwner,
    ACL: acl as any,
    StorageClass: storageClass as any,
    CacheControl: options.cacheControl,
    Metadata: options.metadata,
  };

  // Log upload parameters
  core.info(`Content-Type: ${uploadParams.ContentType || 'not specified'}`);
  if (uploadParams.ACL) {
    core.info(`ACL: ${uploadParams.ACL}`);
  }
  if (uploadParams.StorageClass) {
    core.info(`Storage Class: ${uploadParams.StorageClass}`);
  }
  if (uploadParams.CacheControl) {
    core.info(`Cache-Control: ${uploadParams.CacheControl}`);
  }
  if (uploadParams.Metadata) {
    core.info(`Metadata: ${JSON.stringify(uploadParams.Metadata)}`);
  }

  // Upload to S3 using Upload class (handles streaming properly)
  try {
    core.info('Starting streaming upload to S3...');

    const upload = new Upload({
      client: s3Client,
      params: uploadParams,
    });

    // Upload with progress tracking
    upload.on('httpUploadProgress', (progress) => {
      if (progress.loaded && progress.total) {
        const percent = ((progress.loaded / progress.total) * 100).toFixed(1);
        core.info(`Upload progress: ${percent}% (${progress.loaded}/${progress.total} bytes)`);
      }
    });

    const response = await upload.done();

    const etag = response.ETag || '';
    const s3Url = `s3://${options.bucket}/${options.key}`;

    core.info(`Successfully uploaded to S3`);
    core.info(`ETag: ${etag}`);

    return {
      etag,
      s3Url,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
    throw error;
  }
}
