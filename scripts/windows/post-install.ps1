# Post-installation script for Vira Villas Rooms
# This script runs after the MSI installer completes
# It sets up MongoDB, configures auto-start, and initializes the application

param(
  [string]$InstallDir = "$env:LOCALAPPDATA\Programs\vira-villas-rooms",
  [string]$MongoUri = "mongodb://127.0.0.1:27017/roomsvv",
  [string]$RepoUrl = "https://github.com/ayushmadan/rooms-vv.git",
  [string]$Branch = "master"
)

$ErrorActionPreference = "Continue"

Write-Output "=== Vira Villas Rooms Post-Installation Setup ==="
Write-Output "Install Directory: $InstallDir"

# Ensure we're in the install directory
if (Test-Path $InstallDir) {
  Set-Location $InstallDir
} else {
  Write-Output "Warning: Install directory not found. Using current directory."
}

# Step 1: Ensure MongoDB is installed and running
Write-Output "`n[1/5] Checking MongoDB installation..."

function Get-MongoServiceName {
  $svc = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
  if ($svc) { return "MongoDB" }
  $svc = Get-Service -Name "MongoDBServer" -ErrorAction SilentlyContinue
  if ($svc) { return "MongoDBServer" }
  return $null
}

$mongoService = Get-MongoServiceName

if (-not $mongoService) {
  Write-Output "MongoDB not found. Attempting to install via winget..."

  if (Get-Command winget -ErrorAction SilentlyContinue) {
    try {
      winget install --id MongoDB.Server --silent --accept-package-agreements --accept-source-agreements
      Start-Sleep -Seconds 10
      $mongoService = Get-MongoServiceName

      if ($mongoService) {
        Write-Output "MongoDB installed successfully as service: $mongoService"
      } else {
        Write-Output "Warning: MongoDB may have been installed but service not detected."
      }
    } catch {
      Write-Output "Warning: MongoDB installation encountered an error: $_"
    }
  } else {
    Write-Output "Warning: winget not available. Please install MongoDB manually from https://www.mongodb.com/try/download/community"
  }
} else {
  Write-Output "MongoDB service found: $mongoService"
}

# Step 2: Configure MongoDB to start automatically
if ($mongoService) {
  Write-Output "`n[2/5] Configuring MongoDB auto-start..."

  try {
    # Set service to start automatically
    sc.exe config $mongoService start= auto | Out-Null

    # Configure service recovery options (restart on failure)
    sc.exe failure $mongoService reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

    # Start the service if not running
    $svcStatus = (Get-Service -Name $mongoService).Status
    if ($svcStatus -ne 'Running') {
      Start-Service -Name $mongoService
      Write-Output "MongoDB service started."
    } else {
      Write-Output "MongoDB service already running."
    }
  } catch {
    Write-Output "Warning: Failed to configure MongoDB service: $_"
  }
}

# Step 3: Create or update .env file
Write-Output "`n[3/5] Configuring environment variables..."

$envPath = Join-Path $InstallDir ".env"
$envExamplePath = Join-Path $InstallDir ".env.example"

if (-not (Test-Path $envPath)) {
  if (Test-Path $envExamplePath) {
    Copy-Item $envExamplePath $envPath
    Write-Output "Created .env from .env.example"
  } else {
    # Create basic .env file
    $envContent = @"
PORT=4000
MONGO_URI=$MongoUri
ADMIN_PIN=1234
REPO_URL=$RepoUrl
REPO_BRANCH=$Branch
"@
    Set-Content -Path $envPath -Value $envContent
    Write-Output "Created .env file with default configuration"
  }
} else {
  Write-Output ".env file already exists"
}

# Step 4: Check Node dependencies
Write-Output "`n[4/5] Checking dependencies..."

$nodeModulesPath = Join-Path $InstallDir "node_modules"

if (Test-Path $nodeModulesPath) {
  Write-Output "Dependencies already packaged with installation"
} else {
  Write-Output "Dependencies not found. Attempting to install..."

  if (Get-Command npm -ErrorAction SilentlyContinue) {
    try {
      Write-Output "Running npm install (this may take a few minutes)..."
      npm install --omit=dev 2>&1 | Out-Null

      if ($LASTEXITCODE -eq 0) {
        Write-Output "Dependencies installed successfully"
      } else {
        Write-Output "Warning: npm install completed with errors (exit code: $LASTEXITCODE)"
      }
    } catch {
      Write-Output "Warning: npm install failed: $_"
      Write-Output "You may need to run 'npm install' manually from: $InstallDir"
    }
  } else {
    Write-Output "Warning: npm not found in PATH"
    Write-Output "Dependencies are missing. Please ensure Node.js is installed and in PATH."
    Write-Output "Then run 'npm install' from: $InstallDir"
  }
}

# Step 5: Create Windows Task Scheduler entry for auto-start
Write-Output "`n[5/5] Configuring application auto-start..."

$taskName = "VitraVillasRooms"
$exePath = Join-Path $InstallDir "Vira Villas Rooms.exe"

if (Test-Path $exePath) {
  try {
    # Remove existing task if it exists
    schtasks /Delete /TN "$taskName" /F 2>$null | Out-Null

    # Create new task to run at startup
    $action = New-ScheduledTaskAction -Execute $exePath
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

    Write-Output "Application configured to start automatically at system startup"
  } catch {
    Write-Output "Warning: Failed to create startup task: $_"
  }
} else {
  Write-Output "Warning: Application executable not found at: $exePath"
}

Write-Output "`n=== Installation Complete ==="
Write-Output "MongoDB URI: $MongoUri"
Write-Output "Application will start automatically on system startup"
Write-Output "You can launch the application from the Start Menu or Desktop shortcut"
Write-Output ""
