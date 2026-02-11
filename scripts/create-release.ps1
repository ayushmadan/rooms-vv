# Helper script to create a new release
# Usage: .\scripts\create-release.ps1 -Version "0.2.0"

param(
  [Parameter(Mandatory=$true)]
  [string]$Version,

  [switch]$SkipBuild,

  [string]$Message = "Release version $Version"
)

$ErrorActionPreference = "Stop"

Write-Output "=== Creating Release v$Version ==="

# Validate version format
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  Write-Error "Version must be in format X.Y.Z (e.g., 0.2.0)"
  exit 1
}

# Ensure we're on main branch
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main" -and $currentBranch -ne "master") {
  Write-Warning "You are not on main/master branch. Current branch: $currentBranch"
  $continue = Read-Host "Continue anyway? (y/N)"
  if ($continue -ne "y") {
    Write-Output "Release cancelled."
    exit 0
  }
}

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
  Write-Warning "You have uncommitted changes:"
  git status --short
  $continue = Read-Host "Commit these changes first? (y/N)"
  if ($continue -ne "y") {
    Write-Output "Release cancelled. Please commit or stash changes first."
    exit 0
  }
}

# Update package.json version
Write-Output "`n[1/6] Updating package.json version to $Version..."
npm version $Version --no-git-tag-version

# Update CHANGELOG.md
Write-Output "`n[2/6] Please update CHANGELOG.md with release notes..."
Write-Output "Press Enter when done..."
$null = Read-Host

# Commit version changes
Write-Output "`n[3/6] Committing version changes..."
git add package.json CHANGELOG.md
git commit -m "chore: bump version to $Version"

# Optional: Build locally before tagging
if (-not $SkipBuild) {
  Write-Output "`n[4/6] Building MSI locally (this may take a few minutes)..."
  npm run build:msi

  Write-Output "Build complete. Please test the MSI from the dist/ folder."
  Write-Output "Press Enter to continue with tagging and pushing..."
  $null = Read-Host
} else {
  Write-Output "`n[4/6] Skipping local build (will build on GitHub Actions)"
}

# Create and push tag
Write-Output "`n[5/6] Creating Git tag v$Version..."
git tag -a "v$Version" -m "$Message"

# Push to remote
Write-Output "`n[6/6] Pushing to GitHub..."
git push origin main
git push origin "v$Version"

Write-Output "`n=== Release Created Successfully ==="
Write-Output "Tag: v$Version"
Write-Output "GitHub Actions will now build and create the release."
Write-Output "Monitor progress at: https://github.com/ayushmadan/rooms-vv/actions"
Write-Output ""
Write-Output "The release will be available at:"
Write-Output "https://github.com/ayushmadan/rooms-vv/releases/tag/v$Version"
Write-Output ""
