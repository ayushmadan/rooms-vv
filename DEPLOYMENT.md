# Deployment Guide

This guide explains how to create and publish new releases of Vira Villas Rooms.

## Overview

The deployment pipeline automatically:
1. Builds a Windows MSI installer
2. Creates a GitHub release with the MSI attached
3. Updates the download link in README
4. Enables auto-update for installed applications

## Release Process

### 1. Prepare the Release

Before creating a release, ensure:

- [ ] All features are tested and working
- [ ] CHANGELOG.md is updated with new features/fixes
- [ ] Version number is decided (follow [Semantic Versioning](https://semver.org/))

### 2. Update Version Number

Edit `package.json` and update the version:

```json
{
  "version": "0.2.0"
}
```

**Version Format:**
- **Major** (1.0.0): Breaking changes
- **Minor** (0.2.0): New features, backwards compatible
- **Patch** (0.1.1): Bug fixes only

### 3. Commit and Tag

```bash
# Commit the version change
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.2.0"

# Create and push the tag
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

**Important:** The tag MUST start with `v` (e.g., `v0.2.0`) to trigger the release workflow.

### 4. GitHub Actions Build

Once you push the tag:

1. GitHub Actions automatically starts the build process
2. Workflow builds the MSI installer on Windows
3. Creates a new GitHub Release
4. Uploads the MSI as a release asset

**Monitor the build:**
- Go to: https://github.com/ayushmadan/rooms-vv/actions
- Check the "Build and Release MSI" workflow
- Build typically takes 5-10 minutes

### 5. Verify the Release

After the workflow completes:

1. Go to: https://github.com/ayushmadan/rooms-vv/releases
2. Verify the new release is created
3. Download and test the MSI installer
4. Check that all release notes are accurate

### 6. Announce the Update

Users with the application installed will:
- See "Update Available" when they click "Check Update"
- Can install the update by clicking "Update & Restart"

## Auto-Update System

### How It Works

1. **Version Checking**:
   - App compares local Git hash with remote master branch
   - Backend endpoint: `/api/system/update/check`
   - Runs when user clicks "Check Update"

2. **Update Installation**:
   - Backend endpoint: `/api/system/update/run`
   - Executes PowerShell script: `scripts/windows/update-app.ps1`
   - Pulls latest code from GitHub
   - Installs dependencies
   - Restarts the application

3. **Version Control**:
   - Each release has a unique Git tag
   - Updates only install if remote version is newer
   - Safe to run multiple times (idempotent)

## Manual Release (Without GitHub Actions)

If you need to create a release manually:

### Option 1: Build Locally

```bash
# Ensure you're on the correct branch
git checkout main
git pull

# Update version
npm version 0.2.0 --no-git-tag-version

# Build MSI
npm run build:msi

# MSI will be in dist/ folder
# Upload manually to GitHub Releases
```

### Option 2: Use Build Pipeline Script

```bash
# Fetch latest code and build
npm run build:msi:pipeline

# Optional: Specify version
powershell -ExecutionPolicy Bypass -File scripts/windows/build-msi.ps1 -Version "0.2.0"
```

## Post-Installation Process

When a user installs the MSI:

1. **MSI Installer**:
   - Extracts application files to `%LOCALAPPDATA%\Programs\vira-villas-rooms`
   - Creates shortcuts (Desktop + Start Menu)

2. **Post-Install Script** (`scripts/windows/post-install.ps1`):
   - Checks for MongoDB installation
   - Installs MongoDB via winget if missing
   - Configures MongoDB to start automatically
   - Sets MongoDB service recovery options
   - Creates `.env` file from `.env.example`
   - Installs Node.js dependencies
   - Configures application auto-start (Task Scheduler)

3. **First Launch**:
   - Application verifies MongoDB is running
   - Initializes database with default configuration
   - Ready for user input

## MongoDB Configuration

The installer ensures MongoDB:
- Is installed (via winget if needed)
- Runs as a Windows service
- Starts automatically on system boot
- Restarts automatically if it crashes
- Uses default URI: `mongodb://127.0.0.1:27017/roomsvv`

## Troubleshooting

### Build Fails on GitHub Actions

- Check workflow logs: https://github.com/ayushmadan/rooms-vv/actions
- Common issues:
  - Missing dependencies in `package.json`
  - Syntax errors in code
  - electron-builder configuration errors

### MSI Installation Fails

- Check user has administrator privileges
- Verify MongoDB installation worked
- Check Windows Event Viewer for errors

### Auto-Update Not Working

- Verify Git is installed on user's machine
- Check internet connection
- Ensure `.git` folder exists in install directory
- Check backend logs for errors

## Security Considerations

1. **Admin PIN**: Default is `1234` - users should change it
2. **Update Verification**: Updates pull from official GitHub repository
3. **MongoDB**: Runs locally, no external network access
4. **Auto-Start**: Can be disabled via Task Scheduler

## Environment Variables

Key environment variables in `.env`:

```env
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/roomsvv
ADMIN_PIN=1234
REPO_URL=https://github.com/ayushmadan/rooms-vv.git
REPO_BRANCH=master
```

## Release Checklist

Before pushing a tag:

- [ ] Version updated in `package.json`
- [ ] CHANGELOG.md updated
- [ ] All tests pass (if applicable)
- [ ] Code reviewed and merged to main
- [ ] No console errors in development build
- [ ] Database migrations documented (if any)

After release:

- [ ] Download and install MSI from GitHub release
- [ ] Test fresh installation on clean Windows machine
- [ ] Test auto-update from previous version
- [ ] MongoDB service running and configured
- [ ] Application starts automatically after reboot
- [ ] All core features working

## Support

For issues or questions:
- GitHub Issues: https://github.com/ayushmadan/rooms-vv/issues
- Check workflow logs for build failures
- Review CHANGELOG.md for version differences
