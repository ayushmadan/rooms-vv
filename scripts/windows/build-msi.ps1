param(
  [string]$RepoUrl = "https://github.com/ayushmadan/rooms-vv.git",
  [string]$Branch = "master",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  git init
  git remote add origin $RepoUrl
}

git fetch origin $Branch
git checkout -B $Branch origin/$Branch
git pull origin $Branch

if ($Version -ne "") {
  npm version $Version --no-git-tag-version
}

npm ci

Write-Host ""
Write-Host "=== Building Windows Installer with Bundled Prerequisites ===" -ForegroundColor Cyan
Write-Host "Using NSIS installer (like DirectX installers)" -ForegroundColor Gray
Write-Host "The installer will include MongoDB and other prerequisites" -ForegroundColor Gray
Write-Host ""

npm run build:msi

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green
Write-Host "Windows installer available in dist/ directory" -ForegroundColor White
Write-Host "The installer includes bundled MongoDB and will install it automatically" -ForegroundColor Gray
Write-Host ""
