# URL to S3 GitHub Action

## Project Overview
A GitHub Action that fetches content from any URL and uploads it to an S3 bucket. Designed to work with `aws-actions/configure-aws-credentials@v4` for AWS authentication.

## Key Requirements

### Inputs

#### Mandatory Parameters
- `url` - The URL to fetch content from
- `s3-bucket` - Target S3 bucket name
- `s3-key` - Target object name/path in S3

#### Optional HTTP Parameters
- `method` - HTTP method (default: `GET`, supports `POST`)
- `headers` - Key/value pairs for HTTP headers (JSON object or multiline key=value format)
- `post-data` - POST data body (used only when method is `POST`)

#### Optional S3 Parameters
- `bucket-owner` - Expected bucket owner account ID
- `acl` - Canned ACL to apply (e.g., `private`, `public-read`, `bucket-owner-full-control`)
- `storage-class` - S3 storage class (e.g., `STANDARD`, `INTELLIGENT_TIERING`)
- `content-type` - Override Content-Type for S3 object
- `cache-control` - Cache-Control header for S3 object
- `metadata` - Custom metadata as JSON object

### Outputs
- `status-code` - HTTP status code from the URL request
- `content-length` - Size of downloaded content in bytes
- `s3-url` - S3 URL of uploaded object (s3://bucket/key format)
- `s3-etag` - ETag of the uploaded S3 object

## Implementation Approach

### Action Type
**JavaScript/TypeScript Action** using Node.js runtime

**Why JavaScript over Composite:**
- Node.js guaranteed on all GitHub-hosted runners (Linux, Windows, macOS)
- No dependency on bash, curl, or AWS CLI being pre-installed
- Better error handling and type safety
- More robust AWS SDK integration
- Easier to test and maintain

### Core Components
1. **action.yml** - GitHub Action metadata and interface definition
2. **src/index.ts** - Main entry point
3. **src/download.ts** - HTTP download logic
4. **src/upload.ts** - S3 upload logic
5. **package.json** - Dependencies and scripts
6. **tsconfig.json** - TypeScript configuration
7. **.gitignore** - Exclude node_modules (dist/ is committed)

### Technology Stack
- **TypeScript** - Type-safe development
- **@actions/core** - GitHub Actions toolkit for inputs/outputs/logging
- **axios** - HTTP client (supports all methods, headers, streaming)
- **@aws-sdk/client-s3** - AWS SDK v3 for S3 operations
- **@vercel/ncc** - Bundle TypeScript + dependencies into single dist/index.js

### Build and Distribution Strategy
**Standard GitHub Actions Pattern** (following `aws-actions/configure-aws-credentials` approach)

**dist/ IS committed to git** - This is the industry standard for JavaScript actions:
- TypeScript source lives in `src/`
- Compiled bundle lives in `dist/index.js` (committed)
- Users get working code immediately when they reference the action
- No build step required at consumption time

**Why commit dist/?**
- GitHub Actions runtime executes `dist/index.js` directly from the repository
- TypeScript isn't compiled on-the-fly
- Dependencies aren't installed at runtime
- Actions must be ready-to-run when checked out

**Release Process:**
1. Developer makes changes to `src/` files
2. Build and commit: `npm run build && git add dist/`
3. Commit and push changes
4. Tag release: `git tag v1.0.0 && git push origin v1.0.0`
5. GitHub Actions workflow verifies dist/ is up-to-date and creates release
6. Workflow auto-updates major version tag (v1 → v1.0.0)

**For users consuming this action:**
- Reference by major version: `uses: predictr-io/url-to-s3@v1` (recommended)
- Or specific version: `uses: predictr-io/url-to-s3@v1.0.0`

### Error Handling
- Validate mandatory parameters
- Handle HTTP errors (4xx, 5xx) gracefully
- Verify AWS credentials are configured (SDK will throw if missing)
- Handle S3 upload failures with descriptive messages
- Use @actions/core for error reporting (action fails properly)

### AWS Credentials
The AWS SDK automatically uses credentials from environment variables set by `aws-actions/configure-aws-credentials@v4`:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` (if using temporary credentials)
- `AWS_REGION`

No additional configuration needed!

## File Structure
```
url-to-s3/
├── .github/
│   └── workflows/
│       └── release.yml          # Verify dist/ and create releases
├── src/
│   ├── index.ts                 # Main entry point (TypeScript source)
│   ├── download.ts              # HTTP download logic
│   └── upload.ts                # S3 upload logic
├── dist/
│   └── index.js                 # Compiled bundle (COMMITTED to git)
├── action.yml                   # Action metadata
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── LICENSE
├── WORKFLOW.md                  # Developer workflow guide
└── CLAUDE.md                    # This file
```

## Current Status
**Phase**: Complete - Ready for initial development and testing

## Implementation Complete
All core files created:
- ✅ TypeScript source code (src/)
- ✅ Action metadata (action.yml)
- ✅ Build configuration (package.json, tsconfig.json)
- ✅ Release workflow (.github/workflows/release.yml)
- ✅ Documentation (README.md, LICENSE)
