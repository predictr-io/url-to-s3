import * as core from '@actions/core';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { PassThrough } from 'stream';

export interface DownloadOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  data?: string;
}

/**
 * Custom stream that tracks bytes transferred
 */
export class ByteCountingStream extends PassThrough {
  public bytesTransferred = 0;

  constructor() {
    super();
    this.on('data', (chunk: Buffer) => {
      this.bytesTransferred += chunk.length;
    });
  }

  /**
   * Get the total number of bytes that have passed through the stream
   */
  getBytesTransferred(): number {
    return this.bytesTransferred;
  }
}

export interface DownloadResult {
  statusCode: number;
  contentLengthHeader: number; // From HTTP header (may be 0 for chunked)
  contentType?: string;
  stream: ByteCountingStream;
}

/**
 * Parse headers from input string
 * Supports both JSON object and multiline key=value format
 */
export function parseHeaders(headersInput?: string): Record<string, string> | undefined {
  if (!headersInput || headersInput.trim() === '') {
    return undefined;
  }

  const trimmed = headersInput.trim();

  // Try parsing as JSON first
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      core.warning(`Failed to parse headers as JSON: ${error}`);
    }
  }

  // Parse as multiline key=value format
  const headers: Record<string, string> = {};
  const lines = trimmed.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') continue;

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex === -1) {
      core.warning(`Skipping invalid header line: ${trimmedLine}`);
      continue;
    }

    const key = trimmedLine.substring(0, separatorIndex).trim();
    const value = trimmedLine.substring(separatorIndex + 1).trim();

    if (key) {
      headers[key] = value;
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Download content from URL and return as a stream
 * This allows streaming directly to S3 without storing locally
 */
export async function downloadAsStream(
  options: DownloadOptions
): Promise<DownloadResult> {
  core.info(`Downloading from ${options.url}`);
  core.info(`Method: ${options.method}`);

  if (options.headers) {
    core.info(`Headers: ${JSON.stringify(options.headers, null, 2)}`);
  }

  const config: AxiosRequestConfig = {
    method: options.method,
    url: options.url,
    headers: options.headers,
    responseType: 'stream',
    maxRedirects: 5,
    validateStatus: (status) => status < 600, // Don't throw on any status code
  };

  // Add request body for POST/PUT/PATCH
  if (options.data && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase())) {
    config.data = options.data;
    core.info(`Request body length: ${options.data.length} bytes`);
  }

  let response: AxiosResponse;

  try {
    response = await axios(config);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `HTTP request failed: ${error.message}${
          error.response ? ` (Status: ${error.response.status})` : ''
        }`
      );
    }
    throw error;
  }

  const statusCode = response.status;
  core.info(`Response status: ${statusCode}`);

  // Check for error status codes
  if (statusCode >= 400) {
    throw new Error(
      `HTTP request failed with status ${statusCode}: ${response.statusText}`
    );
  }

  const contentType = response.headers['content-type'];
  const contentLengthHeader = parseInt(response.headers['content-length'] || '0', 10);

  core.info(`Content-Type: ${contentType || 'unknown'}`);
  if (contentLengthHeader > 0) {
    core.info(`Content-Length header: ${contentLengthHeader} bytes (${(contentLengthHeader / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    core.info(`Content-Length header: not set (chunked transfer encoding)`);
  }

  // Create a byte-counting stream to track actual bytes transferred
  const byteCounter = new ByteCountingStream();

  // Pipe response through our tracking stream
  response.data.pipe(byteCounter);

  // Handle errors on the source stream
  response.data.on('error', (error: Error) => {
    byteCounter.destroy(error);
  });

  return {
    statusCode,
    contentLengthHeader: contentLengthHeader || 0,
    contentType,
    stream: byteCounter,
  };
}
