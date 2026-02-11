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
npm run build:msi

Write-Output "MSI build finished. Output available in dist/."
