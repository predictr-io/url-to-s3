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

## Runtime Information

### Node.js Runtime
- **Current Runtime**: Node.js 24 (as of November 2025)
- **Previous Runtime**: Node.js 20 (deprecated, EOL April 2026)
- **GitHub Actions Support**: GitHub runner v2.328.0+ supports Node 24
- **Configuration**: Set in `action.yml` via `runs.using: 'node24'`

### Runtime Migration Notes
- Node 24 became available on GitHub-hosted runners in 2025
- GitHub will switch default from Node 20 to Node 24 on March 4, 2026
- All predictr-io actions migrated to Node 24 in November 2025
- No code changes required for Node 24 migration - only metadata update in action.yml

## Versioning and Release Strategy

### Version Tags
Each action maintains multiple tag formats:
- **Specific versions**: `v0.1.0`, `v0.1.1`, `v0.2.0` - Immutable, tied to specific releases
- **Major version tags**: `v0`, `v1` - Mutable, automatically updated to latest patch/minor within major version
- **Patch bumps**: Use for runtime updates, bug fixes, dependency updates with no breaking changes
- **Minor bumps**: Use for new features that are backward compatible
- **Major bumps**: Use for breaking changes (e.g., v0 → v1)

### Automated Release Workflow
`.github/workflows/release.yml` handles versioning automatically:
1. **Triggered by**: Pushing any version tag (e.g., `git push origin v0.1.2`)
2. **Verifies**: dist/ is built and committed
3. **Validates**: dist/ matches current source code
4. **Creates**: GitHub release with auto-generated release notes
5. **Updates**: Major version tag (v0 or v1) to point to new release
6. **Force-pushes**: Updated major version tag to GitHub

### Release Process for Developers
```bash
# Make changes to src/
npm run build              # Compile TypeScript to dist/
git add -A
git commit -m "Description of changes"
git push

# Create and push version tag
git tag v0.1.2            # Use appropriate semver
git push origin v0.1.2    # Workflow auto-updates v0 tag

# Workflow handles:
# - Creating GitHub release
# - Updating v0 → v0.1.2
# - Publishing release notes
```

### User Consumption
Users can reference actions in three ways:
- `uses: predictr-io/action-name@v0` - **Recommended**: Auto-updates to latest v0.x.x
- `uses: predictr-io/action-name@v0.1.2` - Pinned to specific version
- `uses: predictr-io/action-name@main` - Latest commit (not recommended for production)

## GitHub Marketplace Publishing

### Marketplace Metadata (in action.yml)
Required fields for marketplace:
- `name`: Action display name (clear, descriptive)
- `description`: Short description (under 125 characters)
- `author`: Author/organization name
- `branding.icon`: Feather icon name for marketplace display
- `branding.color`: Color theme (matches cloud provider: orange=AWS, blue=GCP)

### Publishing Process
1. **Initial publish**: Create first release, check "Publish to GitHub Marketplace"
2. **Select category**: Choose one primary category (Deployment, CI, Utilities, etc.)
3. **Automatic updates**: Future releases automatically update marketplace listing
4. **README sync**: Marketplace pulls README from main branch (always current)

### Marketplace Categories
GitHub Actions Marketplace categories (choose one):
- **Deployment** - Infrastructure management, resource creation/deletion
- **Continuous Integration** - Pipeline integration, message/metric sending
- **Utilities** - General-purpose tools, data transfer
- **Testing** - Test execution and validation
- (Other categories: API management, Chat, Code quality, Security, Monitoring, etc.)

### Discoverability Best Practices
- **Repository topics**: Add multiple tags (aws, gcp, messaging, ci-cd, testing, etc.)
- **Keywords in description**: Include relevant search terms
- **Comprehensive README**: Document multiple use cases and examples
- **Good branding**: Use meaningful icons and appropriate colors

### Branding Guidelines (predictr-io standard)
- **AWS actions**: `color: 'orange'` (AWS brand color)
- **GCP actions**: `color: 'blue'` (GCP brand color)
- **Create actions**: `icon: 'plus-square'` or `icon: 'plus-circle'`
- **Delete actions**: `icon: 'trash-2'`, `color: 'red'`, description includes "DESTRUCTIVE ACTION"
- **Send/publish actions**: `icon: 'send'`
- **Data actions**: `icon: 'database'`, `icon: 'search'`, `icon: 'activity'`

