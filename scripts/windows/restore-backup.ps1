param([string]$BackupDir)

$ErrorActionPreference = "Stop"
$mongoUri = "mongodb://127.0.0.1:27017/roomsvv"

Write-Host "Restoring database from: $BackupDir"

try {
  $manifest = Get-Content "$BackupDir\backup-manifest.json" | ConvertFrom-Json

  foreach ($collection in $manifest.collections) {
    $jsonFile = Join-Path $BackupDir "$collection.json"
    if (Test-Path $jsonFile) {
      Write-Host "Importing $collection..."
      & mongoimport --uri=$mongoUri --collection=$collection --file=$jsonFile --jsonArray --drop
    }
  }

  Write-Host "Restore complete"
  exit 0
} catch {
  Write-Host "Restore failed: $_"
  exit 1
}
