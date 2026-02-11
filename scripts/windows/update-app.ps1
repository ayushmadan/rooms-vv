param(
  [string]$RepoUrl = "https://github.com/ayushmadan/rooms-vv.git",
  [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  throw "Current directory is not a git repository."
}

git remote get-url origin | Out-Null
if ($LASTEXITCODE -ne 0) {
  git remote add origin $RepoUrl
}

git fetch origin $Branch
git pull origin $Branch
npm install --omit=dev

Write-Output "Update completed from $RepoUrl ($Branch)."
