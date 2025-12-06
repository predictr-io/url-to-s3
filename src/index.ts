import * as core from '@actions/core';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { downloadAsStream, parseHeaders } from './download';
import { uploadStreamToS3, parseMetadata, parseTags } from './upload';

/**
 * Check if an S3 object exists
 * Returns true if the object exists, false otherwise
 */
async function objectExists(s3Client: S3Client, bucket: string, key: string): Promise<boolean> {
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
 * Main action entry point
 * Streams content directly from URL to S3 without storing locally
 */
async function run(): Promise<void> {
  // Get inputs outside try block so they're available in catch for error summary
  const url = core.getInput('url', { required: true });
  const s3Bucket = core.getInput('s3-bucket', { required: true });
  const s3Key = core.getInput('s3-key', { required: true });

  try {

    const method = core.getInput('method') || 'GET';
    const headersInput = core.getInput('headers');
    const postData = core.getInput('post-data');
    const timeout = parseInt(core.getInput('timeout') || '900000', 10);
    const enableRetry = core.getInput('enable-retry') === 'true';

    const authType = core.getInput('auth-type') as 'none' | 'basic' | 'bearer';
    const authUsername = core.getInput('auth-username');
    const authPassword = core.getInput('auth-password');
    const authToken = core.getInput('auth-token');

    const bucketOwner = core.getInput('bucket-owner');
    const acl = core.getInput('acl');
    const storageClass = core.getInput('storage-class') || 'STANDARD';
    const contentTypeOverride = core.getInput('content-type');
    const cacheControl = core.getInput('cache-control');
    const metadataInput = core.getInput('metadata');
    const tagsInput = core.getInput('tags');
    const ifNotExists = core.getInput('if-not-exists') === 'true';

    // Parse headers, metadata, and tags
    const headers = parseHeaders(headersInput);
    const metadata = parseMetadata(metadataInput);
    const tags = parseTags(tagsInput);

    // Check if object exists BEFORE downloading (if if-not-exists flag is set)
    // This avoids unnecessary bandwidth usage when the object already exists
    if (ifNotExists) {
      core.info('Checking if S3 object already exists...');
      const s3Client = new S3Client({});
      const exists = await objectExists(s3Client, s3Bucket, s3Key);

      if (exists) {
        core.info(`Object already exists at s3://${s3Bucket}/${s3Key}`);
        core.info('Skipping download and upload due to if-not-exists flag');

        const s3Url = `s3://${s3Bucket}/${s3Key}`;

        // Set outputs for skipped operation
        core.setOutput('status-code', '0'); // No HTTP request made
        core.setOutput('content-length', '0'); // No bytes transferred
        core.setOutput('s3-url', s3Url);
        core.setOutput('s3-etag', ''); // Unknown etag
        core.setOutput('object-existed', 'true');

        // Write summary to GitHub Step Summary
        await core.summary
          .addHeading('URL to S3 Transfer Summary')
          .addTable([
            [{data: 'Source URL', header: true}, url],
            [{data: 'Target S3', header: true}, s3Url],
            [{data: 'Status', header: true}, '⏭️ Skipped (object already exists)'],
            [{data: 'Bytes Transferred', header: true}, '0'],
          ])
          .write();

        core.info('✓ Action completed - object already existed, no download or upload needed');
        return; // Exit early
      }

      core.info('Object does not exist, proceeding with download and upload');
    }

    core.info('Starting streaming download from URL...');

    // Download from URL (returns a stream)
    const downloadResult = await downloadAsStream({
      url,
      method: method.toUpperCase(),
      headers,
      data: postData,
      timeout,
      enableRetry,
      authType,
      authUsername,
      authPassword,
      authToken,
    });

    core.info('HTTP request successful, streaming to S3...');

    // Determine content type (use override if provided, otherwise use detected)
    const contentType = contentTypeOverride || downloadResult.contentType;

    // Upload to S3 (streaming directly from download)
    // Note: We've already checked if-not-exists upfront, so no need to check again
    const uploadResult = await uploadStreamToS3({
      bucket: s3Bucket,
      key: s3Key,
      stream: downloadResult.stream,
      contentLengthHint: downloadResult.contentLengthHeader,
      contentType,
      bucketOwner: bucketOwner || undefined,
      acl: acl || undefined,
      storageClass,
      cacheControl: cacheControl || undefined,
      metadata,
      tags,
    });

    // Upload completed successfully
    core.info('Stream upload completed successfully');

    // Get actual bytes transferred (now that the stream has been fully consumed)
    const actualBytesTransferred = downloadResult.stream.getBytesTransferred();
    core.info(`Total bytes transferred: ${actualBytesTransferred} bytes (${(actualBytesTransferred / 1024 / 1024).toFixed(2)} MB)`);

    // Verify against header if it was provided
    if (downloadResult.contentLengthHeader > 0 && actualBytesTransferred !== downloadResult.contentLengthHeader) {
      core.warning(
        `Bytes transferred (${actualBytesTransferred}) differs from Content-Length header (${downloadResult.contentLengthHeader})`
      );
    }

    // Set all outputs ONLY after the entire operation succeeds
    core.setOutput('status-code', downloadResult.statusCode.toString());
    core.setOutput('content-length', actualBytesTransferred.toString()); // Use actual bytes, not header
    core.setOutput('s3-url', uploadResult.s3Url);
    core.setOutput('s3-etag', uploadResult.etag);
    core.setOutput('object-existed', 'false');

    // Format bytes for display
    const bytesFormatted = actualBytesTransferred.toLocaleString();
    const mbFormatted = (actualBytesTransferred / 1024 / 1024).toFixed(2);

    // Write summary to GitHub Step Summary
    await core.summary
      .addHeading('URL to S3 Transfer Summary')
      .addTable([
        [{data: 'Source URL', header: true}, url],
        [{data: 'Target S3', header: true}, uploadResult.s3Url],
        [{data: 'Status', header: true}, '✅ Success'],
        [{data: 'HTTP Status', header: true}, downloadResult.statusCode.toString()],
        [{data: 'Bytes Transferred', header: true}, `${bytesFormatted} (${mbFormatted} MB)`],
        [{data: 'S3 ETag', header: true}, uploadResult.etag],
      ])
      .write();

    core.info('✓ Action completed successfully - content streamed directly to S3');
  } catch (error) {
    // Provide comprehensive error information for debugging
    core.error('Action failed with error:');

    if (error instanceof Error) {
      core.error(`Error: ${error.message}`);

      // Log stack trace for debugging
      if (error.stack) {
        core.error('Stack trace:');
        core.error(error.stack);
      }

      // Check for AWS SDK specific errors
      if ('Code' in error || '$metadata' in error) {
        core.error('AWS SDK Error Details:');
        const awsError = error as any;

        if (awsError.Code) {
          core.error(`  Error Code: ${awsError.Code}`);
        }
        if (awsError.$metadata) {
          core.error(`  HTTP Status: ${awsError.$metadata.httpStatusCode}`);
          core.error(`  Request ID: ${awsError.$metadata.requestId}`);
          if (awsError.$metadata.attempts) {
            core.error(`  Attempts: ${awsError.$metadata.attempts}`);
          }
        }
        if (awsError.message) {
          core.error(`  Message: ${awsError.message}`);
        }
      }

      // Check for axios/HTTP specific errors
      if ('response' in error) {
        const axiosError = error as any;
        core.error('HTTP Error Details:');

        if (axiosError.response) {
          core.error(`  Status: ${axiosError.response.status} ${axiosError.response.statusText}`);
          core.error(`  URL: ${axiosError.config?.url}`);
          core.error(`  Method: ${axiosError.config?.method?.toUpperCase()}`);

          if (axiosError.response.headers) {
            core.error('  Response Headers:');
            core.error(JSON.stringify(axiosError.response.headers, null, 2));
          }

          if (axiosError.response.data) {
            core.error('  Response Body:');
            // Limit response body to first 500 chars to avoid log spam
            const responseData = String(axiosError.response.data);
            core.error(responseData.substring(0, 500) + (responseData.length > 500 ? '...' : ''));
          }
        } else if (axiosError.request) {
          core.error('  No response received from server');
          core.error(`  URL: ${axiosError.config?.url}`);
        }
      }

      // Write failure summary to GitHub Step Summary
      await core.summary
        .addHeading('URL to S3 Transfer Summary')
        .addTable([
          [{data: 'Source URL', header: true}, url],
          [{data: 'Target S3', header: true}, `s3://${s3Bucket}/${s3Key}`],
          [{data: 'Status', header: true}, '❌ Failed'],
          [{data: 'Error', header: true}, error.message],
        ])
        .write();

      // Set the failure with a clear message
      core.setFailed(`Action failed: ${error.message}`);
    } else {
      // Handle non-Error objects
      const errorMessage = 'An unknown error occurred - check logs for details';

      // Write failure summary to GitHub Step Summary
      await core.summary
        .addHeading('URL to S3 Transfer Summary')
        .addTable([
          [{data: 'Source URL', header: true}, url],
          [{data: 'Target S3', header: true}, `s3://${s3Bucket}/${s3Key}`],
          [{data: 'Status', header: true}, '❌ Failed'],
          [{data: 'Error', header: true}, errorMessage],
        ])
        .write();

      core.error(`Unknown error type: ${typeof error}`);
      core.error(`Error value: ${JSON.stringify(error, null, 2)}`);
      core.setFailed(errorMessage);
    }
  }
}

// Run the action
run();
