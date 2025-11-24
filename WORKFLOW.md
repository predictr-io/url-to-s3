# Developer Workflow Guide

This guide explains how to develop, test, and release changes to this GitHub Action.

## Initial Setup

### 1. Clone and Install Dependencies

```bash
git clone git@github.com:predictr-io/url-to-s3.git
cd url-to-s3
npm install
```

### 2. Initial Build

Build the TypeScript code to create `dist/index.js`:

```bash
npm run build
```

This compiles `src/**/*.ts` → `dist/index.js` (bundled with all dependencies).

### 3. Commit Initial Build

```bash
git add dist/
git commit -m "Initial build"
git push
```

**Important**: The `dist/` folder MUST be committed to git for the action to work!

## Making Changes

### 1. Edit Source Code

Make your changes to the TypeScript files in `src/`:
- `src/index.ts` - Main orchestration
- `src/download.ts` - HTTP download logic
- `src/upload.ts` - S3 upload logic

### 2. Build

After making changes, rebuild the action:

```bash
npm run build
```

This updates `dist/index.js` with your changes.

### 3. Commit Changes

**Always commit both source AND built files together:**

```bash
git add src/ dist/
git commit -m "Add feature: support custom timeout"
git push
```

**Why commit dist/?** GitHub Actions needs the compiled JavaScript to run. When users reference your action, GitHub clones the repo and executes `dist/index.js` directly - it doesn't build it.

## Testing Your Changes

### Option 1: Test in Another Repository

Create a test workflow in another repository:

```yaml
name: Test URL to S3
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/test-role
          aws-region: us-east-1

      # Reference your branch for testing
      - uses: predictr-io/url-to-s3@your-branch-name
        with:
          url: 'https://httpbin.org/json'
          s3-bucket: 'test-bucket'
          s3-key: 'test/output.json'
```

### Option 2: Test Locally (Limited)

You can test individual functions locally, but full action testing requires a GitHub Actions environment.

```bash
# Run TypeScript compiler checks
npm run build

# (Optional) Add unit tests
npm test
```

## Releasing a New Version

### Version Numbering

Use semantic versioning:
- **Major** (v1.0.0 → v2.0.0): Breaking changes
- **Minor** (v1.0.0 → v1.1.0): New features, backward compatible
- **Patch** (v1.0.0 → v1.0.1): Bug fixes

### Version Management

**The git tag is the source of truth** - this is what users reference in their workflows.

The version also exists in `package.json` and should be kept in sync. We recommend using `npm version` to handle both automatically.

### Release Process (Recommended)

Use `npm version` to bump the version in package.json AND create the git tag:

```bash
# 1. Ensure all changes are committed
git add src/ dist/
git commit -m "Add retry logic"
git push

# 2. Use npm version to bump version and create tag
npm version patch   # For bug fixes: 1.0.0 → 1.0.1
# OR
npm version minor   # For new features: 1.0.0 → 1.1.0
# OR
npm version major   # For breaking changes: 1.0.0 → 2.0.0

# This updates package.json AND creates a git tag (v1.0.1)

# 3. Rebuild with new version
npm run build

# 4. Commit the updated dist/
git add dist/
git commit --amend --no-edit

# 5. Push everything
git push --follow-tags
```

**What `npm version` does:**
- Updates version in package.json
- Creates a git commit with the version change
- Creates a git tag (e.g., v1.0.1)

#### Alternative: Manual Release Process

If you prefer manual control:

```bash
# 1. Update package.json version manually
vim package.json  # Change "version": "1.0.1"

# 2. Build
npm run build

# 3. Commit everything
git add package.json dist/
git commit -m "Release v1.0.1"
git push

# 4. Create and push tag manually
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

#### GitHub Actions Takes Over

The release workflow automatically:
1. ✅ Verifies `dist/index.js` exists
2. ✅ Verifies `dist/` is up-to-date (rebuilds to check)
3. ✅ Creates GitHub Release with auto-generated notes
4. ✅ Updates major version tag (`v1` → points to `v1.0.0`)

**If the workflow fails**, it will tell you exactly what to fix:
- Missing `dist/index.js`? Run `npm run build && git add dist/`
- Out-of-date dist/? Run `npm run build && git add dist/`

#### 4. Users Can Now Reference Your Release

After the workflow completes:

```yaml
# Recommended: Major version (auto-updated)
uses: predictr-io/url-to-s3@v1

# Specific version
uses: predictr-io/url-to-s3@v1.0.0
```

## Common Workflows

### Quick Fix Workflow (Patch Release)

```bash
# 1. Fix the bug in src/
vim src/download.ts

# 2. Build and commit
npm run build
git add src/ dist/
git commit -m "fix: Handle timeout errors correctly"
git push

# 3. Create patch release (1.0.0 → 1.0.1)
npm version patch
npm run build
git add dist/
git commit --amend --no-edit
git push --follow-tags
```

### Feature Development Workflow (Minor Release)

```bash
# 1. Create feature branch
git checkout -b feature/add-retry-logic

# 2. Make changes
vim src/download.ts

# 3. Build and commit
npm run build
git add src/ dist/
git commit -m "feat: Add retry logic with exponential backoff"

# 4. Push and create PR
git push origin feature/add-retry-logic
# Create PR on GitHub

# 5. After PR is merged to main, create release
git checkout main
git pull

# 6. Create minor release (1.0.0 → 1.1.0)
npm version minor
npm run build
git add dist/
git commit --amend --no-edit
git push --follow-tags
```

### Major Version Release (Breaking Changes)

```bash
# 1. Make breaking changes
vim src/index.ts  # Change input parameter names

# 2. Build and commit
npm run build
git add src/ dist/
git commit -m "BREAKING: Rename 's3-bucket' to 'bucket'"
git push

# 3. Create major release (1.0.0 → 2.0.0)
npm version major
npm run build
git add dist/
git commit --amend --no-edit
git push --follow-tags

# The workflow will create a new v2 major tag
# Users on v1 stay on v1.x.x (no breaking changes)
# Users who want v2 can upgrade: uses: predictr-io/url-to-s3@v2
```

## Troubleshooting

### "dist/index.js not found" Error

The release workflow failed because `dist/` wasn't committed:

```bash
npm install
npm run build
git add dist/
git commit -m "Build dist/ for release"
git tag -f v1.0.0  # Force update the tag
git push -f origin v1.0.0
```

### "dist/ is out of date" Error

You committed changes to `src/` but forgot to rebuild:

```bash
npm run build
git add dist/
git commit -m "Update dist/ for release"
git tag -f v1.0.0  # Force update the tag
git push -f origin v1.0.0
```

### Testing a Tag Locally Before Pushing

```bash
# Create tag locally
git tag -a v1.0.0 -m "Test release"

# Test in another repo by referencing your branch
# Don't push the tag yet

# If you need to modify
git tag -d v1.0.0  # Delete local tag
# Make changes, then recreate tag
```

## Best Practices

1. **Always commit dist/ with src/**
   - Never commit source changes without rebuilding dist/
   - Use: `npm run build && git add src/ dist/`

2. **Test before releasing**
   - Push changes to a branch first
   - Test the branch in another repository
   - Only tag when confident

3. **Write clear commit messages**
   - Follow conventional commits: `feat:`, `fix:`, `docs:`, etc.
   - Explain WHY, not just WHAT

4. **Use major versions for users**
   - Recommend users use `@v1` not `@v1.0.0`
   - You can push patches/features without breaking them
   - They get updates automatically (within v1.x.x)

5. **Document breaking changes**
   - Clearly mark breaking changes in commit messages
   - Update README with migration guide
   - Bump major version

## Quick Reference

```bash
# Daily development - make changes and commit
npm run build && git add src/ dist/ && git commit -m "feat: add feature"

# Create patch release (1.0.0 → 1.0.1)
npm version patch && npm run build && git add dist/ && git commit --amend --no-edit && git push --follow-tags

# Create minor release (1.0.0 → 1.1.0)
npm version minor && npm run build && git add dist/ && git commit --amend --no-edit && git push --follow-tags

# Create major release (1.0.0 → 2.0.0)
npm version major && npm run build && git add dist/ && git commit --amend --no-edit && git push --follow-tags

# Fix release (if workflow fails)
npm run build && git add dist/ && git commit --amend --no-edit && git push -f

# Check what version users see
git show v1:dist/index.js | head -20

# View current version
npm version --json
```
