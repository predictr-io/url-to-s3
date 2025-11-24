# URL to S3 GitHub Action

A GitHub Action that fetches content from any URL and uploads it directly to Amazon S3. Perfect for archiving web content, downloading and storing artifacts, or integrating external data into your S3-backed workflows.

## Features

- Download content from any URL using GET, POST, or other HTTP methods
- Upload directly to S3 with full control over bucket settings
- Custom HTTP headers support
- POST data for API endpoints
- S3 ACL and storage class configuration
- Custom metadata and cache control
- Works seamlessly with `aws-actions/configure-aws-credentials`
- Cross-platform support (Linux, macOS, Windows runners)

## Prerequisites

You must configure AWS credentials before using this action. We recommend using `aws-actions/configure-aws-credentials@v4`:

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/my-github-actions-role
    aws-region: us-east-1
```

## Usage

### Basic Example

Download a file and upload to S3:

```yaml
- name: Download and upload to S3
  uses: predictr-io/url_to_s3@v1
  with:
    url: 'https://example.com/data.json'
    s3-bucket: 'my-bucket'
    s3-key: 'downloads/data.json'
```

### Complete Example

```yaml
name: Archive External Content

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  archive:
    runs-on: ubuntu-latest

    steps:
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/my-github-actions-role
          aws-region: us-east-1

      - name: Download and upload to S3
        id: upload
        uses: predictr-io/url_to_s3@v1
        with:
          url: 'https://api.example.com/data'
          method: 'GET'
          s3-bucket: 'my-archive-bucket'
          s3-key: 'archives/${{ github.run_number }}/data.json'
          storage-class: 'INTELLIGENT_TIERING'
          cache-control: 'max-age=86400'

      - name: Print results
        run: |
          echo "Status Code: ${{ steps.upload.outputs.status-code }}"
          echo "Content Length: ${{ steps.upload.outputs.content-length }}"
          echo "S3 URL: ${{ steps.upload.outputs.s3-url }}"
          echo "ETag: ${{ steps.upload.outputs.s3-etag }}"
```

### POST Request Example

Send POST data to an API and upload the response:

```yaml
- name: POST to API and upload response
  uses: predictr-io/url_to_s3@v1
  with:
    url: 'https://api.example.com/generate-report'
    method: 'POST'
    headers: |
      Authorization=Bearer ${{ secrets.API_TOKEN }}
      Content-Type=application/json
    post-data: '{"type": "daily", "format": "csv"}'
    s3-bucket: 'reports-bucket'
    s3-key: 'reports/daily-report.csv'
```

### Custom Headers Example (JSON format)

```yaml
- name: Download with custom headers
  uses: predictr-io/url_to_s3@v1
  with:
    url: 'https://api.example.com/protected/data'
    headers: |
      {
        "Authorization": "Bearer ${{ secrets.API_TOKEN }}",
        "User-Agent": "GitHub-Actions-Bot",
        "Accept": "application/json"
      }
    s3-bucket: 'my-bucket'
    s3-key: 'data.json'
```

### With ACL and Metadata

```yaml
- name: Upload with public read access
  uses: predictr-io/url_to_s3@v1
  with:
    url: 'https://example.com/public-data.json'
    s3-bucket: 'public-bucket'
    s3-key: 'public/data.json'
    acl: 'public-read'
    content-type: 'application/json'
    metadata: |
      {
        "source": "example.com",
        "archived-by": "github-actions",
        "workflow-run": "${{ github.run_id }}"
      }
```

## Inputs

### Required Inputs

| Input | Description |
|-------|-------------|
| `url` | The URL to fetch content from |
| `s3-bucket` | Target S3 bucket name |
| `s3-key` | Target object name/path in S3 |

### Optional HTTP Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `method` | HTTP method (GET, POST, PUT, etc.) | `GET` |
| `headers` | HTTP headers as JSON object or multiline key=value pairs | - |
| `post-data` | POST/PUT request body data | - |

### Optional S3 Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `bucket-owner` | Expected bucket owner account ID | - |
| `acl` | Canned ACL (`private`, `public-read`, `bucket-owner-full-control`, etc.) | - |
| `storage-class` | S3 storage class (`STANDARD`, `INTELLIGENT_TIERING`, `GLACIER`, etc.) | `STANDARD` |
| `content-type` | Override Content-Type for S3 object | Auto-detected from HTTP response |
| `cache-control` | Cache-Control header for S3 object | - |
| `metadata` | Custom metadata as JSON object | - |

## Outputs

| Output | Description |
|--------|-------------|
| `status-code` | HTTP status code from the URL request |
| `content-length` | Size of downloaded content in bytes |
| `s3-url` | S3 URL of uploaded object (s3://bucket/key format) |
| `s3-etag` | ETag of the uploaded S3 object |

## Header Format

Headers can be provided in two formats:

**JSON format:**
```yaml
headers: |
  {
    "Authorization": "Bearer token123",
    "User-Agent": "MyApp/1.0"
  }
```

**Key=value format:**
```yaml
headers: |
  Authorization=Bearer token123
  User-Agent=MyApp/1.0
```

## Storage Classes

Supported S3 storage classes:
- `STANDARD` (default)
- `REDUCED_REDUNDANCY`
- `STANDARD_IA`
- `ONEZONE_IA`
- `INTELLIGENT_TIERING`
- `GLACIER`
- `DEEP_ARCHIVE`
- `GLACIER_IR`

## ACL Options

Supported canned ACLs:
- `private`
- `public-read`
- `public-read-write`
- `authenticated-read`
- `aws-exec-read`
- `bucket-owner-read`
- `bucket-owner-full-control`

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript and bundles everything into `dist/index.js` using `@vercel/ncc`.

### Release Process

1. Make your changes and commit to main
2. Create and push a version tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```
3. GitHub Actions will automatically:
   - Build the action
   - Create a GitHub Release
   - Update the major version tag (e.g., `v1`)

Users can then reference your action as `predictr-io/url_to_s3@v1` (recommended) or `predictr-io/url_to_s3@v1.0.0` (specific version).

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
