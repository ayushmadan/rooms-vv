param([string]$BackupDir)

$ErrorActionPreference = "Stop"
$mongoUri = "mongodb://127.0.0.1:27017/roomsvv"

Write-Host "Creating backup in: $BackupDir"

try {
  # Get all collections
  $collections = & mongo --quiet --eval "db.getCollectionNames()" $mongoUri
  $collectionsArray = $collections -replace "[\[\]]","" -split ","
  $collectionsList = @()

  foreach ($col in $collectionsArray) {
    $col = $col.Trim() -replace '"',''
    if ($col -and $col -ne "system.indexes") {
      Write-Host "Exporting $col..."
      $outFile = Join-Path $BackupDir "$col.json"
      & mongoexport --uri=$mongoUri --collection=$col --out=$outFile --jsonArray
      $collectionsList += $col
    }
  }

  # Create manifest
  $manifest = @{
    timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    collections = $collectionsList
  }
  $manifest | ConvertTo-Json | Out-File "$BackupDir\backup-manifest.json"

  Write-Host "Backup complete"
  exit 0
} catch {
  Write-Host "Backup failed: $_"
  exit 1
}
