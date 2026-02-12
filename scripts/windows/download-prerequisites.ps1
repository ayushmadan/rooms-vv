# Download prerequisites for bundled installer
# This script downloads MongoDB and other required installers to bundle in the MSI

param(
  [string]$OutputDir = "build\installers",
  [string]$MongoVersion = "8.0.4"  # Latest stable as of 2025
)

$ErrorActionPreference = "Stop"

Write-Host "=== Downloading Prerequisites for Bundled Installer ===" -ForegroundColor Cyan
Write-Host ""

# Create output directory
if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  Write-Host "Created directory: $OutputDir" -ForegroundColor Green
}

# MongoDB Download
Write-Host "[1/2] Downloading MongoDB $MongoVersion installer..." -ForegroundColor Yellow

# MongoDB download URL (Community Server MSI for Windows x64)
$mongoUrl = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-$MongoVersion-signed.msi"
$mongoOutput = Join-Path $OutputDir "mongodb-installer.msi"

try {
  # Check if already downloaded
  if (Test-Path $mongoOutput) {
    $fileSize = (Get-Item $mongoOutput).Length / 1MB
    Write-Host "  MongoDB installer already exists ($([math]::Round($fileSize, 2)) MB)" -ForegroundColor Gray
    Write-Host "  Skipping download. Delete the file to re-download." -ForegroundColor Gray
  } else {
    Write-Host "  Downloading from: $mongoUrl" -ForegroundColor Gray
    Write-Host "  This may take several minutes..." -ForegroundColor Gray

    # Download with progress
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $mongoUrl -OutFile $mongoOutput -UseBasicParsing

    $fileSize = (Get-Item $mongoOutput).Length / 1MB
    Write-Host "  Downloaded successfully! ($([math]::Round($fileSize, 2)) MB)" -ForegroundColor Green
  }
} catch {
  Write-Host "  Error downloading MongoDB: $_" -ForegroundColor Red
  Write-Host "  You may need to download it manually from: https://www.mongodb.com/try/download/community" -ForegroundColor Yellow
  exit 1
}

# Create setup script for MongoDB
Write-Host ""
Write-Host "[2/2] Creating MongoDB setup script..." -ForegroundColor Yellow

$setupScriptPath = Join-Path $OutputDir "setup-mongodb.ps1"
$setupScriptContent = @'
# MongoDB Setup Script
# This script is called by the MSI installer to configure MongoDB after installation

param(
  [string]$InstallDir = $PSScriptRoot
)

$ErrorActionPreference = "Continue"

Write-Host "Configuring MongoDB..." -ForegroundColor Cyan

function Get-MongoServiceName {
  $svc = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
  if ($svc) { return "MongoDB" }
  $svc = Get-Service -Name "MongoDBServer" -ErrorAction SilentlyContinue
  if ($svc) { return "MongoDBServer" }
  return $null
}

# Wait for MongoDB service to be available (up to 30 seconds)
$maxAttempts = 15
$attempt = 0
$serviceName = $null

while ($attempt -lt $maxAttempts -and -not $serviceName) {
  $serviceName = Get-MongoServiceName
  if (-not $serviceName) {
    Start-Sleep -Seconds 2
    $attempt++
  }
}

if ($serviceName) {
  Write-Host "Found MongoDB service: $serviceName" -ForegroundColor Green

  # Set service to start automatically
  sc.exe config $serviceName start= auto | Out-Null

  # Configure recovery options (restart on failure)
  sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

  # Start the service
  Start-Service -Name $serviceName -ErrorAction SilentlyContinue

  $status = (Get-Service -Name $serviceName).Status
  if ($status -eq 'Running') {
    Write-Host "MongoDB service is running" -ForegroundColor Green
  } else {
    Write-Host "MongoDB service status: $status" -ForegroundColor Yellow
  }
} else {
  Write-Host "MongoDB service not found after installation" -ForegroundColor Yellow
  Write-Host "You may need to install MongoDB manually" -ForegroundColor Yellow
}

Write-Host "MongoDB configuration complete" -ForegroundColor Cyan
'@

Set-Content -Path $setupScriptPath -Value $setupScriptContent -Encoding UTF8
Write-Host "  Created: $setupScriptPath" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "=== Download Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Downloaded files:" -ForegroundColor White
Get-ChildItem $OutputDir | ForEach-Object {
  $size = if ($_.PSIsContainer) { "DIR" } else { "$([math]::Round($_.Length / 1MB, 2)) MB" }
  Write-Host "  - $($_.Name) ($size)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "These files will be bundled into the MSI installer." -ForegroundColor Green
Write-Host ""
