import * as core from '@actions/core';
import { S3Client, PutObjectCommandInput, HeadObjectCommand } from '@aws-sdk/client-s3';
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
  tags?: Record<string, string>;
}

export interface UploadResult {
  etag: string;
  s3Url: string;
  objectExisted?: boolean;
}

/**
 * Parse key=value pairs from input string
 * Supports both JSON object and semicolon-separated key=value pairs
 */
export function parseKeyValuePairs(input?: string, name = 'input'): Record<string, string> | undefined {
  if (!input || input.trim() === '') {
    return undefined;
  }

  const trimmed = input.trim();

  // Try parsing as JSON first
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        core.warning(`${name} must be a JSON object`);
        return undefined;
      }
      return parsed;
    } catch (error) {
      core.warning(`Failed to parse ${name} as JSON: ${error}`);
    }
  }

  // Parse as semicolon-separated key=value format
  const result: Record<string, string> = {};
  const pairs = trimmed.split(';');

  for (const pair of pairs) {
    const trimmedPair = pair.trim();
    if (trimmedPair === '') continue;

    const separatorIndex = trimmedPair.indexOf('=');
    if (separatorIndex === -1) {
      core.warning(`Skipping invalid ${name} pair: ${trimmedPair}`);
      continue;
    }

    const key = trimmedPair.substring(0, separatorIndex).trim();
    const value = trimmedPair.substring(separatorIndex + 1).trim();

    if (key) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Parse metadata from input string
 * Supports both JSON object and semicolon-separated key=value pairs
 */
export function parseMetadata(metadataInput?: string): Record<string, string> | undefined {
  return parseKeyValuePairs(metadataInput, 'metadata');
}

/**
 * Parse tags from input string
 * Supports both JSON object and semicolon-separated key=value pairs
 */
export function parseTags(tagsInput?: string): Record<string, string> | undefined {
  return parseKeyValuePairs(tagsInput, 'tags');
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
 * Check if an S3 object exists
 * Returns true if the object exists, false otherwise
 */
export async function objectExists(s3Client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }));
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // Re-throw other errors (permissions, etc.)
    throw error;
  }
}

/**
 * Upload stream to S3
 * Streams data directly to S3 without storing locally
 */
export async function uploadStreamToS3(options: UploadOptions, ifNotExists = false): Promise<UploadResult> {
  core.info(`Uploading to S3: s3://${options.bucket}/${options.key}`);

  // Validate inputs
  const acl = validateAcl(options.acl);
  const storageClass = validateStorageClass(options.storageClass);

  // Create S3 client (automatically uses credentials from environment)
  const s3Client = new S3Client({});

  // Check if object exists (if requested)
  if (ifNotExists) {
    core.info('Checking if object already exists in S3...');
    const exists = await objectExists(s3Client, options.bucket, options.key);

    if (exists) {
      core.info(`Object already exists at s3://${options.bucket}/${options.key}`);
      core.info('Skipping upload due to if-not-exists flag');

      // Return result with objectExisted flag
      return {
        etag: '',
        s3Url: `s3://${options.bucket}/${options.key}`,
        objectExisted: true,
      };
    }

    core.info('Object does not exist, proceeding with upload');
  }

  // Log content length hint if known
  if (options.contentLengthHint && options.contentLengthHint > 0) {
    core.info(`Content-Length hint: ${options.contentLengthHint} bytes (${(options.contentLengthHint / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    core.info(`Content-Length: unknown (will be determined during upload)`);
  }

  // Convert tags to S3 tagging format
  let tagging: string | undefined;
  if (options.tags && Object.keys(options.tags).length > 0) {
    tagging = Object.entries(options.tags)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
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
    Tagging: tagging,
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
  if (uploadParams.Tagging) {
    core.info(`Tags: ${JSON.stringify(options.tags)}`);
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
      objectExisted: false,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
    throw error;
  }
}
