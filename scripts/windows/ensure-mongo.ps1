param(
  [switch]$InstallIfMissing,
  [string]$MongoUri = "mongodb://127.0.0.1:27017/roomsvv"
)

$ErrorActionPreference = "SilentlyContinue"

function Get-MongoServiceName {
  $svc = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
  if ($svc) { return "MongoDB" }
  $svc = Get-Service -Name "MongoDBServer" -ErrorAction SilentlyContinue
  if ($svc) { return "MongoDBServer" }
  return $null
}

$serviceName = Get-MongoServiceName

if (-not $serviceName -and $InstallIfMissing) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id MongoDB.Server --silent --accept-package-agreements --accept-source-agreements
  }
  Start-Sleep -Seconds 5
  $serviceName = Get-MongoServiceName
}

if (-not $serviceName) {
  Write-Output "MongoDB service not found"
  exit 1
}

sc.exe config $serviceName start= auto | Out-Null
sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

Start-Service -Name $serviceName

Write-Output "Mongo service ensured: $serviceName"
Write-Output "Mongo URI: $MongoUri"
